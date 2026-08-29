import { Component } from '@angular/core';
import {
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  imports: [CommonModule, ReactiveFormsModule],
})
export class LoginComponent {
  loginError = '';

  loginForm = new FormGroup({
    loginEmail: new FormControl('', [Validators.required, Validators.email]),
    loginPassword: new FormControl('', [
      Validators.required,
      Validators.minLength(6),
    ]),
  });

  constructor(private authService: AuthService, private router: Router) {}

  onLoginSubmit() {
    if (this.loginForm.valid) {
      this.loginError = '';
      const credentials = {
        email: this.loginForm.value.loginEmail!,
        password: this.loginForm.value.loginPassword!,
      };
      this.authService.login(credentials).subscribe({
        next: (res) => {
          this.authService.setToken(res.token);
          this.loginForm.reset();
          const role = this.authService.currentUser()?.role ?? '';
          this.router.navigateByUrl(this.authService.homePathForRole(role));
        },
        error: (err) => {
          this.loginError = err?.error?.error || 'Login failed. Please try again.';
        },
      });
    } else {
      this.loginForm.markAllAsTouched();
    }
  }
}
