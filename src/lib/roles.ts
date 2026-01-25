import { auth } from "@clerk/nextjs/server";
import { Role } from "@prisma/client";

export const checkRole = async (role: Role) => {
    const { sessionClaims } = await auth();
    const metadata = sessionClaims?.metadata as CustomJwtSessionClaims['metadata'];
    return metadata?.role === role;
};

export const getUserRole = async () => {
    const { sessionClaims } = await auth();
    const metadata = sessionClaims?.metadata as CustomJwtSessionClaims['metadata'];
    return metadata?.role;
};
