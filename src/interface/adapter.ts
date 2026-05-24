import * as readline from 'readline';

export interface PlayerAdapter {
  read(): Promise<string>;
  write(text: string): void;
  close(): void;
}

export class CliAdapter implements PlayerAdapter {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }

  read(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question('\n> ', (answer) => resolve(answer));
    });
  }

  write(text: string): void {
    console.log(text);
  }

  close(): void {
    this.rl.close();
  }
}
