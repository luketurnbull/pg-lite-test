import "./style.css";
import { db, todos, type Todo } from "./db";

async function initApp() {
  // Initialize database
  await db.init();

  // Render app shell
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div>
      <h1>PGlite + Drizzle</h1>
      <p class="subtitle">Local-first database with live queries</p>
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
  function renderTodos(todoItems: Todo[]) {
    if (todoItems.length === 0) {
      todoList.innerHTML =
        '<li class="empty">No todos yet. Add one above!</li>';
      return;
    }

    todoList.innerHTML = todoItems
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

  // Subscribe to live updates - changes sync across all tabs
  const unsubscribe = await todos.subscribe(renderTodos);

  // Clean up on page unload
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });

  // Add todo
  addButton.addEventListener("click", async () => {
    const description = input.value.trim();
    if (description) {
      await todos.add(description);
      input.value = "";
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
      await todos.toggle(id);
    }

    if (target.classList.contains("delete-btn")) {
      await todos.delete(id);
    }
  });

  console.log("App initialized with live queries!");
}

initApp().catch(console.error);
