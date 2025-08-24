import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private httpClient:HttpClient) { }

  private userbaseUrl:string = "http://localhost:3000/api/users";

  login(data:any){
    return this.httpClient.post(`${this.userbaseUrl}/login`,data);
  }

  sigupup(data:any){
    return this.httpClient.post(`${this.userbaseUrl}/`,data);
  }

}
