const { safeIpcHandle } = require('./safeIpc');
const {
  createTodo,
  deleteTodo,
  getTodoList,
  updateTodo,
  updateTodoCompleted
} = require('../services/todoService');

function registerTodoIpc() {
  safeIpcHandle('get-todo-list', () => getTodoList(), {
    message: '读取待办失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('create-todo', (event, todoData) => {
    const todo = createTodo(todoData);

    return todo;
  }, {
    message: '新建待办失败，请稍后重试。'
  });

  safeIpcHandle('update-todo', (event, todoId, todoData) => {
    const todo = updateTodo(todoId, todoData);

    return todo;
  }, {
    message: '更新待办失败，请稍后重试。'
  });

  safeIpcHandle('delete-todo', (event, todoId) => {
    const result = deleteTodo(todoId);

    return result;
  }, {
    message: '删除待办失败，请稍后重试。'
  });

  safeIpcHandle('update-todo-completed', (event, todoId, completed) => {
    const todo = updateTodoCompleted(todoId, completed);

    return todo;
  }, {
    message: '更新待办状态失败，请稍后重试。'
  });
}

module.exports = {
  registerTodoIpc
};
