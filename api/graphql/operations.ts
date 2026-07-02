/** Sample GraphQL operations — replace with your schema's queries/mutations. */

export const USERS_QUERY = /* GraphQL */ `
  query Users {
    users { id username email }
  }
`;

export const CREATE_USER = /* GraphQL */ `
  mutation CreateUser($username: String!, $email: String!) {
    createUser(username: $username, email: $email) { id username email }
  }
`;
