import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Runs once before the app finishes bootstrapping (including the initial route),
    // so by the time any guard runs, currentUser is already correctly populated (or
    // correctly null) - guards stay synchronous, no async-guard/flash-of-redirect
    // complexity needed. Never blocks startup: tryRestoreSession() always resolves,
    // even when there's no session to restore.
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return firstValueFrom(authService.tryRestoreSession());
    }),
  ]
};
