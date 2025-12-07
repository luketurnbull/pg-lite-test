import "./style.css";
import { eq } from "drizzle-orm";
import { runMigrations } from "./db/migrate";
import { db } from "./db/client";
import { todosTable } from "./db/schema";

async function initApp() {
  // Run migrations to ensure tables exist
  await runMigrations();

  // Fetch existing todos
  const todos = await db.select().from(todosTable);
  console.log("Existing todos:", todos);

  // Render app
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div>
      <h1>PGlite + Drizzle Todo App</h1>
      <div class="card">
        <input type="text" id="todo-input" placeholder="Enter a todo..." />
        <button id="add-todo" type="button">Add Todo</button>
      </div>
      <ul id="todo-list"></ul>
    </div>
  `;

  const input = document.querySelector<HTMLInputElement>("#todo-input")!;
  const addButton = document.querySelector<HTMLButtonElement>("#add-todo")!;
  const todoList = document.querySelector<HTMLUListElement>("#todo-list")!;

  async function renderTodos() {
    const todos = await db.select().from(todosTable);
    todoList.innerHTML = todos
      .map(
        (todo) => `
        <li style="text-decoration: ${todo.completed ? "line-through" : "none"}">
          ${todo.description}
          <button data-id="${todo.id}" class="toggle-btn">
            ${todo.completed ? "Undo" : "Done"}
          </button>
          <button data-id="${todo.id}" class="delete-btn">Delete</button>
        </li>
      `,
      )
      .join("");
  }

  addButton.addEventListener("click", async () => {
    const description = input.value.trim();
    if (description) {
      await db.insert(todosTable).values({ description });
      input.value = "";
      await renderTodos();
    }
  });

  input.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      addButton.click();
    }
  });

  todoList.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const id = Number(target.dataset.id);

    if (target.classList.contains("toggle-btn")) {
      const [todo] = await db
        .select()
        .from(todosTable)
        .where(eq(todosTable.id, id));
      if (todo) {
        await db
          .update(todosTable)
          .set({ completed: !todo.completed })
          .where(eq(todosTable.id, id));
        await renderTodos();
      }
    }

    if (target.classList.contains("delete-btn")) {
      await db.delete(todosTable).where(eq(todosTable.id, id));
      await renderTodos();
    }
  });

  await renderTodos();
}

initApp().catch(console.error);
