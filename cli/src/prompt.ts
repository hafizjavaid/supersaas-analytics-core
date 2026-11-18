import { stdin, stderr } from "node:process";

async function readPiped() {
	let text = "";
	for await (const chunk of stdin) {
		text += String(chunk);
	}
	return text.split(/\r?\n/)[0] ?? "";
}

// Reads a line without echoing it, so the key stays out of the terminal's scrollback.
function readHidden(prompt: string) {
	return new Promise<string>((resolve, reject) => {
		let typed = "";
		stderr.write(prompt);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");
		const finish = (settle: () => void) => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.off("data", onData);
			stderr.write("\n");
			settle();
		};
		const onData = (chunk: string) => {
			for (const character of chunk) {
				if (character === "\r" || character === "\n") {
					return finish(() => resolve(typed));
				}
				if (character === "\u0003") {
					return finish(() => reject(new Error("Cancelled")));
				}
				typed = character === "\u007F" || character === "\b" ? typed.slice(0, -1) : typed + character;
			}
		};
		stdin.on("data", onData);
	});
}

export function readSecret(prompt: string) {
	return stdin.isTTY ? readHidden(prompt) : readPiped();
}
