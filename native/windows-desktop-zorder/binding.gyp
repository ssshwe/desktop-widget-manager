{
  "targets": [
    {
      "target_name": "windows_desktop_zorder",
      "sources": [
        "src/desktop_zorder.cc"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "UNICODE",
        "_UNICODE"
      ],
      "libraries": [
        "user32.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [
            "/std:c++17"
          ],
          "ExceptionHandling": 1
        }
      }
    }
  ]
}
