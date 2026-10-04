/** Avatar query changes are local navigation; other documents are not the app. */
export function isTrustedAppUrl(candidate, appUrl) {
  try {
    const actual = new URL(candidate)
    const expected = new URL(appUrl)
    return actual.protocol === expected.protocol && actual.host === expected.host &&
      actual.pathname === expected.pathname && !actual.username && !actual.password
  } catch { return false }
}

export function isCameraRequest(permission, mediaTypes) {
  return permission === 'media' && Array.isArray(mediaTypes) && mediaTypes.length > 0 &&
    mediaTypes.every((type) => type === 'video')
}
