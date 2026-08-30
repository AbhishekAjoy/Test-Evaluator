import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// Attaches the bearer access token (in-memory, see AuthService) to every outgoing
// request when one exists, and withCredentials so the httpOnly refresh cookie actually
// travels on the requests that need it (login/refresh/logout - the cookie is scoped
// server-side to /api/users, so setting this broadly is harmless for every other
// request, which the backend never reads a cookie from anyway).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  return next(
    req.clone({
      ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
      withCredentials: true,
    })
  );
};
