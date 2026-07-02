/** GraphQL response models — zod (source-of-truth validation). */
import { z } from "zod";

export const User = z.object({ id: z.string(), username: z.string(), email: z.string() });

export const UsersData = z.object({ users: z.array(User) });
export const CreateUserData = z.object({ createUser: User });
