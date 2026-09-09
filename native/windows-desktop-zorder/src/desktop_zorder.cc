#include <node_api.h>
#include <windows.h>

#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

namespace {

constexpr UINT kRefreshMessage = WM_APP + 41;
constexpr UINT_PTR kValidationTimer = 1;
constexpr UINT kValidationIntervalMs = 1500;
constexpr wchar_t kMonitorWindowClass[] = L"DesktopWidgetZOrderMonitor";

std::mutex g_mutex;
std::unordered_set<HWND> g_desktopWindows;
std::atomic<bool> g_monitorRunning{false};
std::thread g_monitorThread;
std::atomic<DWORD> g_monitorThreadId{0};
std::atomic<HWND> g_monitorWindow{nullptr};
HWINEVENTHOOK g_foregroundHook = nullptr;
HWINEVENTHOOK g_minimizeHook = nullptr;
HWINEVENTHOOK g_visibilityHook = nullptr;
UINT g_taskbarCreatedMessage = 0;

struct OperationResult {
  bool ok;
  DWORD errorCode;
  std::string message;
};

std::string Win32Message(DWORD errorCode) {
  if (errorCode == 0) return "";

  LPWSTR buffer = nullptr;
  const DWORD length = FormatMessageW(
      FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
          FORMAT_MESSAGE_IGNORE_INSERTS,
      nullptr,
      errorCode,
      MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
      reinterpret_cast<LPWSTR>(&buffer),
      0,
      nullptr);

  if (!length || !buffer) return "Win32 error " + std::to_string(errorCode);

  const int utf8Length = WideCharToMultiByte(
      CP_UTF8, 0, buffer, static_cast<int>(length), nullptr, 0, nullptr, nullptr);
  std::string message(static_cast<size_t>(utf8Length), '\0');
  WideCharToMultiByte(CP_UTF8, 0, buffer, static_cast<int>(length), message.data(),
                      utf8Length, nullptr, nullptr);
  LocalFree(buffer);

  while (!message.empty() &&
         (message.back() == '\r' || message.back() == '\n' || message.back() == ' ')) {
    message.pop_back();
  }

  return message;
}

OperationResult Success(const std::string& message = "ok") {
  return {true, 0, message};
}

OperationResult Failure(const std::string& message, DWORD errorCode = 0) {
  std::string detail = message;
  if (errorCode != 0) detail += ": " + Win32Message(errorCode);
  return {false, errorCode, detail};
}

BOOL CALLBACK FindDesktopHostCallback(HWND topWindow, LPARAM parameter) {
  auto* result = reinterpret_cast<HWND*>(parameter);
  if (!IsWindow(topWindow)) return TRUE;

  const HWND shellView =
      FindWindowExW(topWindow, nullptr, L"SHELLDLL_DefView", nullptr);
  if (shellView) {
    wchar_t className[64]{};
    GetClassNameW(topWindow, className, 64);
    // Current Explorer versions place the desktop view under either Progman
    // or WorkerW. Keep the DefView check as the authority so future Shell
    // class changes can still fall back safely.
    const bool knownDesktopClass =
        wcscmp(className, L"Progman") == 0 || wcscmp(className, L"WorkerW") == 0;
    *result = topWindow;
    return knownDesktopClass ? FALSE : TRUE;
  }
  return TRUE;
}

HWND FindDesktopHost() {
  HWND desktopHost = nullptr;
  EnumWindows(FindDesktopHostCallback, reinterpret_cast<LPARAM>(&desktopHost));

  if (desktopHost) return desktopHost;

  // Explorer may temporarily host SHELLDLL_DefView directly under Progman.
  const HWND progman = FindWindowW(L"Progman", nullptr);
  if (progman && FindWindowExW(progman, nullptr, L"SHELLDLL_DefView", nullptr)) {
    return progman;
  }

  return progman;
}

bool IsRegisteredWidget(HWND window) {
  return g_desktopWindows.find(window) != g_desktopWindows.end();
}

HWND FindWindowImmediatelyAboveDesktop(HWND desktopHost) {
  HWND candidate = GetWindow(desktopHost, GW_HWNDPREV);
  while (candidate && IsRegisteredWidget(candidate)) {
    candidate = GetWindow(candidate, GW_HWNDPREV);
  }
  return candidate;
}

OperationResult ApplyDesktopZOrderLocked(HWND window) {
  if (!window || !IsWindow(window)) {
    return Failure("Widget HWND is no longer valid", ERROR_INVALID_WINDOW_HANDLE);
  }

  const HWND desktopHost = FindDesktopHost();
  if (!desktopHost || !IsWindow(desktopHost)) {
    return Failure("Windows desktop host was not found", ERROR_FILE_NOT_FOUND);
  }

  // Show Desktop may minimize or hide top-level tool windows. Registered
  // widgets represent visible components, so restore them without activation
  // before putting them back into the desktop band.
  if (IsIconic(window) || !IsWindowVisible(window)) {
    ShowWindowAsync(window, SW_SHOWNOACTIVATE);
  }

  SetLastError(0);
  const LONG_PTR currentStyle = GetWindowLongPtrW(window, GWL_EXSTYLE);
  if (currentStyle == 0 && GetLastError() != 0) {
    return Failure("Could not read widget extended style", GetLastError());
  }

  // TOOLWINDOW keeps widgets out of Alt+Tab. NOACTIVATE is deliberately not
  // used because widgets must keep text input, menus, drag/drop and clicks.
  const LONG_PTR desktopStyle =
      (currentStyle | WS_EX_TOOLWINDOW) & ~static_cast<LONG_PTR>(WS_EX_APPWINDOW);
  if (desktopStyle != currentStyle) {
    SetLastError(0);
    const LONG_PTR previousStyle =
        SetWindowLongPtrW(window, GWL_EXSTYLE, desktopStyle);
    if (previousStyle == 0 && GetLastError() != 0) {
      return Failure("Could not apply widget desktop style", GetLastError());
    }
  }

  const HWND windowAboveDesktop = FindWindowImmediatelyAboveDesktop(desktopHost);
  const HWND insertAfter = windowAboveDesktop ? windowAboveDesktop : HWND_TOP;
  const UINT flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE |
                     SWP_SHOWWINDOW | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS;

  if (!SetWindowPos(window, insertAfter, 0, 0, 0, 0, flags)) {
    return Failure("SetWindowPos could not restore desktop Z-order", GetLastError());
  }

  return Success("Desktop Z-order applied");
}

OperationResult RestoreNormalZOrder(HWND window) {
  if (!window || !IsWindow(window)) {
    return Failure("Widget HWND is no longer valid", ERROR_INVALID_WINDOW_HANDLE);
  }

  if (!SetWindowPos(window, HWND_NOTOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE |
                        SWP_FRAMECHANGED)) {
    return Failure("Could not restore normal Z-order", GetLastError());
  }

  return Success("Normal Z-order restored");
}

void ApplyAllDesktopWindows() {
  std::lock_guard<std::mutex> lock(g_mutex);
  for (auto iterator = g_desktopWindows.begin();
       iterator != g_desktopWindows.end();) {
    if (!IsWindow(*iterator)) {
      iterator = g_desktopWindows.erase(iterator);
      continue;
    }

    ApplyDesktopZOrderLocked(*iterator);
    ++iterator;
  }
}

void CALLBACK WinEventCallback(HWINEVENTHOOK, DWORD, HWND window, LONG objectId,
                               LONG, DWORD, DWORD) {
  if (objectId != OBJID_WINDOW && objectId != 0) return;
  if (window && IsRegisteredWidget(window)) return;

  const HWND monitorWindow = g_monitorWindow.load();
  if (monitorWindow) PostMessageW(monitorWindow, kRefreshMessage, 0, 0);
}

LRESULT CALLBACK MonitorWindowProcedure(HWND window, UINT message, WPARAM wParam,
                                        LPARAM lParam) {
  if (message == kRefreshMessage || message == WM_DISPLAYCHANGE ||
      message == WM_SETTINGCHANGE || message == WM_POWERBROADCAST ||
      message == g_taskbarCreatedMessage) {
    ApplyAllDesktopWindows();
    return 0;
  }

  if (message == WM_TIMER && wParam == kValidationTimer) {
    ApplyAllDesktopWindows();
    return 0;
  }

  if (message == WM_DESTROY) {
    PostQuitMessage(0);
    return 0;
  }

  return DefWindowProcW(window, message, wParam, lParam);
}

void MonitorThreadMain() {
  g_monitorThreadId.store(GetCurrentThreadId());
  g_taskbarCreatedMessage = RegisterWindowMessageW(L"TaskbarCreated");

  WNDCLASSEXW windowClass{};
  windowClass.cbSize = sizeof(windowClass);
  windowClass.lpfnWndProc = MonitorWindowProcedure;
  windowClass.hInstance = GetModuleHandleW(nullptr);
  windowClass.lpszClassName = kMonitorWindowClass;
  RegisterClassExW(&windowClass);

  // A hidden top-level tool window receives TaskbarCreated broadcasts after
  // Explorer restarts; message-only windows do not receive HWND_BROADCAST.
  g_monitorWindow.store(CreateWindowExW(
      WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, kMonitorWindowClass, L"", WS_POPUP,
      0, 0, 0, 0, nullptr, nullptr, windowClass.hInstance, nullptr));

  g_foregroundHook = SetWinEventHook(
      EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr,
      WinEventCallback, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  g_minimizeHook = SetWinEventHook(
      EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, nullptr,
      WinEventCallback, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  g_visibilityHook = SetWinEventHook(
      EVENT_OBJECT_SHOW, EVENT_OBJECT_HIDE, nullptr, WinEventCallback, 0, 0,
      WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);

  const HWND monitorWindow = g_monitorWindow.load();
  if (monitorWindow) {
    SetTimer(monitorWindow, kValidationTimer, kValidationIntervalMs, nullptr);
  }

  ApplyAllDesktopWindows();

  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  if (g_foregroundHook) UnhookWinEvent(g_foregroundHook);
  if (g_minimizeHook) UnhookWinEvent(g_minimizeHook);
  if (g_visibilityHook) UnhookWinEvent(g_visibilityHook);
  g_foregroundHook = nullptr;
  g_minimizeHook = nullptr;
  g_visibilityHook = nullptr;

  const HWND closingMonitorWindow = g_monitorWindow.load();
  if (closingMonitorWindow) {
    KillTimer(closingMonitorWindow, kValidationTimer);
    if (IsWindow(closingMonitorWindow)) DestroyWindow(closingMonitorWindow);
    g_monitorWindow.store(nullptr);
  }

  UnregisterClassW(kMonitorWindowClass, windowClass.hInstance);
  g_monitorThreadId.store(0);
  g_monitorRunning = false;
}

void EnsureMonitorStarted() {
  bool expected = false;
  if (g_monitorRunning.compare_exchange_strong(expected, true)) {
    g_monitorThread = std::thread(MonitorThreadMain);
  }
}

void StopMonitor() {
  if (!g_monitorRunning.load()) {
    if (g_monitorThread.joinable()) g_monitorThread.join();
    return;
  }

  for (size_t attempt = 0;
       attempt < 100 && !g_monitorWindow.load() && !g_monitorThreadId.load();
       ++attempt) {
    Sleep(1);
  }

  const HWND window = g_monitorWindow.load();
  if (window) {
    PostMessageW(window, WM_CLOSE, 0, 0);
  } else if (g_monitorThreadId.load()) {
    PostThreadMessageW(g_monitorThreadId.load(), WM_QUIT, 0, 0);
  }

  if (g_monitorThread.joinable()) g_monitorThread.join();
  g_monitorRunning = false;
}

bool ReadWindowHandle(napi_env environment, napi_value value, HWND* window) {
  napi_valuetype type = napi_undefined;
  if (napi_typeof(environment, value, &type) != napi_ok) return false;

  uint64_t rawValue = 0;
  if (type == napi_bigint) {
    bool lossless = false;
    if (napi_get_value_bigint_uint64(environment, value, &rawValue, &lossless) !=
            napi_ok ||
        !lossless) {
      return false;
    }
  } else if (type == napi_number) {
    double numberValue = 0;
    if (napi_get_value_double(environment, value, &numberValue) != napi_ok ||
        numberValue <= 0) {
      return false;
    }
    rawValue = static_cast<uint64_t>(numberValue);
  } else if (type == napi_string) {
    size_t length = 0;
    if (napi_get_value_string_utf8(environment, value, nullptr, 0, &length) !=
        napi_ok) {
      return false;
    }
    std::string text(length + 1, '\0');
    napi_get_value_string_utf8(environment, value, text.data(), text.size(),
                               &length);
    rawValue = _strtoui64(text.c_str(), nullptr, 10);
  } else {
    return false;
  }

  *window = reinterpret_cast<HWND>(static_cast<uintptr_t>(rawValue));
  return *window != nullptr;
}

napi_value CreateResult(napi_env environment, const OperationResult& result) {
  napi_value object;
  napi_create_object(environment, &object);

  napi_value ok;
  napi_get_boolean(environment, result.ok, &ok);
  napi_set_named_property(environment, object, "ok", ok);

  napi_value errorCode;
  napi_create_uint32(environment, result.errorCode, &errorCode);
  napi_set_named_property(environment, object, "errorCode", errorCode);

  napi_value message;
  napi_create_string_utf8(environment, result.message.c_str(), NAPI_AUTO_LENGTH,
                          &message);
  napi_set_named_property(environment, object, "message", message);
  return object;
}

napi_value InvalidHandleResult(napi_env environment) {
  return CreateResult(environment,
                      Failure("A valid HWND integer is required",
                              ERROR_INVALID_PARAMETER));
}

napi_value SetDesktopMode(napi_env environment, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(environment, info, &argumentCount, arguments, nullptr, nullptr);

  HWND window = nullptr;
  if (argumentCount != 1 || !ReadWindowHandle(environment, arguments[0], &window)) {
    return InvalidHandleResult(environment);
  }
  if (!IsWindow(window)) {
    return CreateResult(environment,
                        Failure("Widget HWND is invalid", ERROR_INVALID_WINDOW_HANDLE));
  }

  OperationResult result;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_desktopWindows.insert(window);
    result = ApplyDesktopZOrderLocked(window);
    if (!result.ok) g_desktopWindows.erase(window);
  }

  if (result.ok) EnsureMonitorStarted();
  return CreateResult(environment, result);
}

napi_value RestoreNormalMode(napi_env environment, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(environment, info, &argumentCount, arguments, nullptr, nullptr);

  HWND window = nullptr;
  if (argumentCount != 1 || !ReadWindowHandle(environment, arguments[0], &window)) {
    return InvalidHandleResult(environment);
  }

  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_desktopWindows.erase(window);
  }
  // BrowserWindow owns the HWND on Chromium's UI thread. The native monitor
  // only unregisters here; Electron performs the normal/not-topmost transition
  // after this call returns, avoiding a cross-thread synchronous SetWindowPos.
  return CreateResult(environment, Success("Desktop monitoring removed"));
}

napi_value UnregisterWindow(napi_env environment, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(environment, info, &argumentCount, arguments, nullptr, nullptr);

  HWND window = nullptr;
  if (argumentCount != 1 || !ReadWindowHandle(environment, arguments[0], &window)) {
    return InvalidHandleResult(environment);
  }

  std::lock_guard<std::mutex> lock(g_mutex);
  const size_t removed = g_desktopWindows.erase(window);
  return CreateResult(environment,
                      Success(removed ? "Widget HWND unregistered"
                                      : "Widget HWND was not registered"));
}

napi_value IsWindowValid(napi_env environment, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(environment, info, &argumentCount, arguments, nullptr, nullptr);

  HWND window = nullptr;
  const bool valid = argumentCount == 1 &&
                     ReadWindowHandle(environment, arguments[0], &window) &&
                     IsWindow(window);
  napi_value result;
  napi_get_boolean(environment, valid, &result);
  return result;
}

napi_value RefreshDesktopMode(napi_env environment, napi_callback_info) {
  ApplyAllDesktopWindows();
  return CreateResult(environment, Success("Desktop Z-order refreshed"));
}

napi_value StopAll(napi_env environment, napi_callback_info) {
  std::vector<HWND> windows;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    windows.assign(g_desktopWindows.begin(), g_desktopWindows.end());
    g_desktopWindows.clear();
  }

  StopMonitor();
  return CreateResult(environment, Success("All native listeners stopped"));
}

napi_value GetStatus(napi_env environment, napi_callback_info) {
  napi_value result;
  napi_create_object(environment, &result);

  size_t registeredCount = 0;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    registeredCount = g_desktopWindows.size();
  }

  napi_value available;
  napi_get_boolean(environment, FindDesktopHost() != nullptr, &available);
  napi_set_named_property(environment, result, "desktopHostAvailable", available);

  napi_value count;
  napi_create_uint32(environment, static_cast<uint32_t>(registeredCount), &count);
  napi_set_named_property(environment, result, "registeredCount", count);

  napi_value running;
  napi_get_boolean(environment, g_monitorRunning.load(), &running);
  napi_set_named_property(environment, result, "monitorRunning", running);
  return result;
}

napi_value InspectWindow(napi_env environment, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(environment, info, &argumentCount, arguments, nullptr, nullptr);

  HWND window = nullptr;
  if (argumentCount != 1 || !ReadWindowHandle(environment, arguments[0], &window)) {
    return InvalidHandleResult(environment);
  }

  const bool valid = IsWindow(window) != FALSE;
  const HWND desktopHost = FindDesktopHost();
  const HWND parent = valid ? GetParent(window) : nullptr;
  const HWND owner = valid ? GetWindow(window, GW_OWNER) : nullptr;
  bool registered = false;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    registered = g_desktopWindows.find(window) != g_desktopWindows.end();
  }

  bool aboveDesktopHost = false;
  HWND candidate = desktopHost ? GetWindow(desktopHost, GW_HWNDPREV) : nullptr;
  for (size_t count = 0; candidate && count < 4096; ++count) {
    if (candidate == window) {
      aboveDesktopHost = true;
      break;
    }
    candidate = GetWindow(candidate, GW_HWNDPREV);
  }

  napi_value result;
  napi_create_object(environment, &result);
  auto setBoolean = [&](const char* name, bool value) {
    napi_value property;
    napi_get_boolean(environment, value, &property);
    napi_set_named_property(environment, result, name, property);
  };
  auto setHandle = [&](const char* name, HWND value) {
    napi_value property;
    napi_create_bigint_uint64(
        environment,
        static_cast<uint64_t>(reinterpret_cast<uintptr_t>(value)), &property);
    napi_set_named_property(environment, result, name, property);
  };

  setBoolean("valid", valid);
  setBoolean("registered", registered);
  setBoolean("aboveDesktopHost", aboveDesktopHost);
  setBoolean("topLevel", parent == nullptr && owner == nullptr);
  setHandle("window", window);
  setHandle("parent", parent);
  setHandle("owner", owner);
  setHandle("desktopHost", desktopHost);
  return result;
}

void Cleanup(void*) {
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_desktopWindows.clear();
  }
  StopMonitor();
}

napi_value Initialize(napi_env environment, napi_value exports) {
  const napi_property_descriptor properties[] = {
      {"setDesktopMode", nullptr, SetDesktopMode, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"restoreNormalMode", nullptr, RestoreNormalMode, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"unregisterWindow", nullptr, UnregisterWindow, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"isWindowValid", nullptr, IsWindowValid, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"refreshDesktopMode", nullptr, RefreshDesktopMode, nullptr, nullptr,
       nullptr, napi_default, nullptr},
      {"stopAll", nullptr, StopAll, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"getStatus", nullptr, GetStatus, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"inspectWindow", nullptr, InspectWindow, nullptr, nullptr, nullptr,
       napi_default, nullptr}};

  napi_define_properties(environment, exports,
                         sizeof(properties) / sizeof(properties[0]), properties);
  napi_add_env_cleanup_hook(environment, Cleanup, nullptr);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
