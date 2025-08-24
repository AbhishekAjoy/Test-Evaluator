import { Component } from '@angular/core';
import {
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent {
  title = 'client';

  constructor(public authService: AuthService) {}

  loginForm = new FormGroup({
    loginEmail: new FormControl('', [Validators.required, Validators.email]),
    loginPassword: new FormControl('', [
      Validators.required,
      Validators.minLength(6),
    ]),
  });

  passwordMatchValidator:ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('signupPassword')?.value;
    const confirm = control.get('signupConfirmPassword')?.value;
    return password === confirm ? null : { mismatch: true };
  }

  signupForm = new FormGroup({
    signupName: new FormControl('', [Validators.required]),
    signupEmail: new FormControl('', [Validators.required, Validators.email]),
    signupPassword: new FormControl('', [
      Validators.required,
      Validators.minLength(6),
    ]),
    signupConfirmPassword: new FormControl('', [Validators.required]),
    signupRole: new FormControl('', [Validators.required])
  },
   this.passwordMatchValidator
);


  onLoginSubmit() {
    if (this.loginForm.valid) {
     // console.log('Login Form Data:', this.loginForm.value);
     this.authService.login(this.loginForm.value).subscribe((res)=>{
      console.log(res);
    });
     this.loginForm.reset();
  }else {
      this.loginForm.markAllAsTouched();
    }
  }

  onSignupSubmit() {
    if (this.signupForm.valid) {
     // console.log('Signup Form Data:', this.signupForm.value);
      let signupReq = {
        name: this.signupForm.value.signupName,
        email: this.signupForm.value.signupEmail,
        password: this.signupForm.value.signupPassword,
        role: this.signupForm.value.signupRole
      }
      this.authService.sigupup(signupReq).subscribe((res)=>{
        console.log(res);
      });
      this.signupForm.reset();
    } else {
      this.signupForm.markAllAsTouched();
    }
  }
}
