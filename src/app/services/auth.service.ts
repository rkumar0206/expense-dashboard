import { Injectable, inject } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);

  // Observable emitting current logged-in user or null
  user$ = user(this.auth);

  async loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
    }
  }

  async logout() {
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }
}
