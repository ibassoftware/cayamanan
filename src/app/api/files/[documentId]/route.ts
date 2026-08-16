import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/identity/service/cookie';
import { resolveSessionFromCookie } from '@/modules/identity/service/session';
import { resolveDocumentForDownload } from '@/modules/employee/service/resolve-document-for-download';

// The app's one binary-serving endpoint (201-file task packet). Every mutation still
// goes through POST /api/actions/[actionId] (00-overview.md §4.3) — this route is
// GET-only and does no writes; it exists only because a browser needs a plain URL to
// download/view an attachment, the same reason /api/chat exists outside the action layer
// for its own (streaming) reason. No business logic lives here beyond session resolution
// and status-code mapping — see service/resolve-document-for-download.ts for the actual
// tenant-scoped lookup and authorization.
export async function GET(request: NextRequest, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;

  // Same session resolution as every other authenticated entry point (src/app/api/chat/
  // route.ts, src/app/api/actions/[actionId]/route.ts) — never anything client-body-
  // supplied.
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await resolveSessionFromCookie(cookieValue);
  if (!session) {
    return new NextResponse(null, { status: 401 });
  }

  const document = await resolveDocumentForDownload(session, documentId);
  if (!document) {
    // 404, never 403: a document in another tenant and a document this caller (an
    // EMPLOYEE) may not see must be indistinguishable from "does not exist" — otherwise
    // this becomes an enumeration oracle over employee records. No PII in this log line.
    return new NextResponse(null, { status: 404 });
  }

  // Filename control characters were already stripped at upload time
  // (service/document-validation.ts's sanitizeFilename); `"`/CR/LF are stripped again
  // here defensively since this is what actually lands in a raw HTTP header value.
  const safeFilename = document.filename.replace(/["\r\n]/g, '');

  return new NextResponse(new Uint8Array(document.content), {
    status: 200,
    headers: {
      // The stored *sniffed* type (see document-validation.ts) — never re-derived here.
      'Content-Type': document.mimeType,
      // Attachment, not inline, is deliberate: it stops a crafted PDF/HTML from ever
      // rendering in this app's own origin, regardless of what a browser might otherwise
      // guess from the bytes.
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
