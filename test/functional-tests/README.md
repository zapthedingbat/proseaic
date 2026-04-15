# Functional Tests

This directory contains functional tests for the editor. These tests are designed to verify that the editor's features work correctly from the user's perspective. They typically involve simulating user interactions with the editor, or the editor with the model, and checking the resulting behavior.

## Models

Models can behave differently based on the model itself and the platform they are running on. For example, models have different capabilities or performance characteristics depending on how they are trained, the prompt they receive, and the platform they are running on. To account for this, we use a test double for the model in our functional tests. This allows us to simulate different model behaviors and ensure that our editor responds correctly in each case.

- Tool calls: We can simulate the model calling tools with specific arguments, and verify that the editor handles these calls correctly.
- Streaming responses: We can simulate the model sending streaming responses, and verify that the editor updates the UI correctly as new data arrives.
- Error handling: We can simulate the model encountering errors, and verify that the editor handles these errors gracefully and provides appropriate feedback to the user.

## Browsers 

The editor relies on various browser APIs for its functionality, such as the DOM API for manipulating the document, the Fetch API for making network requests, and the Web Streams API for handling streaming data. In our functional tests, we can use test doubles or mocks for these APIs to simulate different scenarios and ensure that our editor interacts with them correctly. For example, we can mock the Fetch API to simulate network errors or slow responses, and verify that the editor handles these situations appropriately.

We should also test the editor in real browsers to ensure that it works correctly with the actual browser APIs and provides a good user experience across different platforms and environments.