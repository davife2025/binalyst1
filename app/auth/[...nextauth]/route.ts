import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth" // Make sure this path points to your authOptions file

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }