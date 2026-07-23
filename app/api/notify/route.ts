import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { tokens, title, body, data } = await request.json()

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'No tokens' }, { status: 400 })
    }

    const { GoogleAuth } = await import('google-auth-library')

    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })

    const accessToken = await auth.getAccessToken()
    const projectId = process.env.FIREBASE_PROJECT_ID

    const results = await Promise.allSettled(
      tokens.map((token: string) =>
        fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                data: data || {},
                webpush: {
                  notification: {
                    title,
                    body,
                    icon: '/icon-192.png',
                    vibrate: [200, 100, 200],
                  },
                },
              },
            }),
          }
        )
      )
    )

    const success = results.filter(r => r.status === 'fulfilled').length
    return NextResponse.json({ success, total: tokens.length })
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}