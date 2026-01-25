import { Role } from "@prisma/client";

declare global {
    interface CustomJwtSessionClaims {
        metadata: {
            role?: Role;
        };
    }
}
