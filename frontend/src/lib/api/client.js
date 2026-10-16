import { ApiError, toApiError } from './errors.js'

/**
 * Base URL for all API requests.
 *
 * Configured via Vite's client-visible environment variables. It must only
 * ever contain non-secret values (never tokens, passwords or keys).
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api'

/**
 * Perform a fetch request against the API.
 *
 * `credentials: "include"` makes the browser attach the HttpOnly access-token
 * cookie automatically. The access token is never exposed to application code.
 */
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: { ...headers },
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch (cause) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the server',
      null,
      { cause },
    )
  }

  const payload = await parseResponseBody(response)

  if (!response.ok) {
    throw toApiError(response, payload)
  }

  return payload
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

export const api = {
  get: (path, config) => request(path, { ...config, method: 'GET' }),
  post: (path, body, config) =>
    request(path, { ...config, method: 'POST', body }),
  patch: (path, body, config) =>
    request(path, { ...config, method: 'PATCH', body }),
  delete: (path, config) => request(path, { ...config, method: 'DELETE' }),
}