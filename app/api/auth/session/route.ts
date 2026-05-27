import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("session");
  
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ 
    authenticated: true, 
    publicKey: session.value 
  });
}
