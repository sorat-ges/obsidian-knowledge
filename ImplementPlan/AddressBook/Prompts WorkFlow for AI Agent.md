Step 1: Implement the Backend (order-service)

  
Prompt: "Please implement the order-service Get All Address Books API exactly as described in

order-service/docs/plan-get-all-address-books.md

. Please write the Repository, Service, Handler, and update the associated Unit Tests/Mocks. Do not write any frontend code yet."

Action: Review the Go code, ensure tests pass, and verify the API shape.



**Step 2: Implement the Frontend (`trading-web`)**

- **Prompt:** _"Now, please implement the Address Book Frontend according to 
    @trading-web/address-book-plan.md
- Keep in mind the rules in 
    @trading-web/CLAUDE.md. Since the backend API is now ready, you can skip the 'mock data' phase and directly implement the BFF and React Query hook to connect to the new API we just built."_
- **Action:** Review the React components, BFF API route, and ensure the UI matches the design system.