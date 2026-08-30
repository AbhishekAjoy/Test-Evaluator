import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Requests to these never trigger a refresh attempt on their own 401 - a failed login is
// just a wrong password, not a dead session, and refresh/logout failing IS the dead-
// session signal itself, not something to react to by calling refresh again.
const AUTH_ENDPOINTS = ['/login', '/refresh', '/logout'];

// 401 means the access token itself is no good (missing, invalid, expired, or the
// account was deactivated - authMiddleware returns 401 for all of these, deliberately
// distinct from 403, which is left alone: authenticated fine, just not permitted for
// this specific action, for the calling component to handle). On a regular request's
// 401, this is the case a route guard alone can't catch - the token was valid when the
// guard let the user in, and went bad sometime after. Try exactly one silent refresh
// and retry the original request; only if the refresh itself fails is the session
// actually treated as dead.
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
      if (error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap((newToken) => next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }))),
        catchError(() => {
          router.navigateByUrl('/login');
          return throwError(() => error);
        })
      );
    })
  );
};
