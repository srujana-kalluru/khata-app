import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { bootKhata } from './prototype';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  encapsulation: ViewEncapsulation.None,
})
export class App implements AfterViewInit {
  private booted = false;
  ngAfterViewInit(): void {
    if (this.booted) return;
    this.booted = true;
    bootKhata();
  }
}
