# Sample Document
This is a simple text editor component. You can select text, and the selection will be highlighted when the editor is focused. It also supports basic markdown formatting like headings, **bold**, and *italics*. Try typing some markdown syntax and see how it formats!

## Architecture

This project is structured around a modular design, separating concerns into distinct layers:

*   **UI Layer**: Contains all user-facing components and interaction logic (e.g., `src/ui/`).
*   **Core Logic Layer**: Houses the main application logic, state management, and component resolution (e.g., `src/lib/`).
*   **Data/Model Layer**: Defines the core data structures and service interfaces (e.g., `src/models/`, `src/platform/`).
*   **Tooling Layer**: Contains the external tool integrations and schema definitions (e.g., `src/tools/`).
*   **Server Layer**: Handles the backend communication and routing (e.g., `src/server/`).

This separation aims to ensure high cohesion and loose coupling, making the system easier to maintain and extend.