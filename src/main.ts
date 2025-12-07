import "./style.css";
import { db, type Todo } from "./db/client";

async function initApp() {
  // Render app shell
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div>
      <h1>PGlite + Drizzle + Comlink</h1>
      <p class="subtitle">Database runs in a Web Worker with live queries</p>
      <div class="card">
        <input type="text" id="todo-input" placeholder="Enter a todo..." />
        <button id="add-todo" type="button">Add Todo</button>
      </div>
      <ul id="todo-list">
        <li class="loading">Loading...</li>
      </ul>
    </div>
  `;

  const input = document.querySelector<HTMLInputElement>("#todo-input")!;
  const addButton = document.querySelector<HTMLButtonElement>("#add-todo")!;
  const todoList = document.querySelector<HTMLUListElement>("#todo-list")!;

  // Render function - called by live query subscription
  function renderTodos(todos: Todo[]) {
    if (todos.length === 0) {
      todoList.innerHTML =
        '<li class="empty">No todos yet. Add one above!</li>';
      return;
    }

    todoList.innerHTML = todos
      .map(
        (todo) => `
        <li class="${todo.completed ? "completed" : ""}">
          <span class="todo-text">${todo.description}</span>
          <div class="todo-actions">
            <button data-id="${todo.id}" class="toggle-btn">
              ${todo.completed ? "Undo" : "Done"}
            </button>
            <button data-id="${todo.id}" class="delete-btn">Delete</button>
          </div>
        </li>
      `,
      )
      .join("");
  }

  // Subscribe to live updates - this is the magic!
  // The callback fires automatically whenever the data changes
  const unsubscribe = await db.subscribe(renderTodos);

  // Clean up on page unload
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });

  // Add todo
  addButton.addEventListener("click", async () => {
    const description = input.value.trim();
    if (description) {
      await db.addTodo(description);
      input.value = "";
      // No need to manually re-render - live query handles it!
    }
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addButton.click();
    }
  });

  // Toggle and delete handlers
  todoList.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const id = Number(target.dataset.id);

    if (target.classList.contains("toggle-btn")) {
      await db.toggleTodo(id);
      // No need to manually re-render - live query handles it!
    }

    if (target.classList.contains("delete-btn")) {
      await db.deleteTodo(id);
      // No need to manually re-render - live query handles it!
    }
  });

  console.log("App initialized with live queries!");
}

initApp().catch(console.error);
