import * as vscode from 'vscode';
import {RectangleContent} from './rectangles';
import {RegisterKind, RegisterContent, RegisterContainer} from './registers';

enum KeybindProgressMode {
    None,   // No current keybind is currently in progress
    RMode,  // Rectangle and/or Register keybinding  [started by 'C-x+r'] is currently in progress
    RModeS, // 'Save Region in register' keybinding [started by 'C-x+r+s'] is currently in progress
    RModeR, // 'Save Rectangle in register' keybinding [started by 'C-x+r+r'] is currently in progress
    RModeI, // 'Insert Register content into buffer' keybinding [started by 'C-x+r+i'] is currently in progress
    AMode   // (FUTURE, TBD) Abbrev keybinding  [started by 'C-x+a'] is currently in progress
};

export class Editor {
    private killRing: string;
    private isKillRepeated: boolean;
    private keybindProgressMode: KeybindProgressMode;
    private registers : RegisterContainer;
    private killedRectangle : RectangleContent;

    constructor() {
        this.killRing = '';
        this.isKillRepeated = false;
        this.keybindProgressMode = KeybindProgressMode.None;
        this.registers = new RegisterContainer;
        this.killedRectangle = new RectangleContent(this);
        vscode.window.onDidChangeTextEditorSelection(() => {
            this.isKillRepeated = false;
        });
    }

    onCancel() : void {
        this.setStatusBarPermanentMessage("");
        this.keybindProgressMode = KeybindProgressMode.None;
        this.setStatusBarMessage("Quit");
    }

    setStatusBarMessage(text: string): vscode.Disposable {
        return vscode.window.setStatusBarMessage(text, 1000);
    }

    setStatusBarPermanentMessage(text: string): vscode.Disposable {
        return vscode.window.setStatusBarMessage(text); 
    }

    setStatusBarMessageAndCleanUp(text: string): vscode.Disposable {
        this.setStatusBarPermanentMessage("");
        return vscode.window.setStatusBarMessage(text, 1000);
    }

    getSelectionRange(): vscode.Range {
        let selection = vscode.window.activeTextEditor.selection,
            start = selection.start,
            end = selection.end;

        return (start.character !== end.character || start.line !== end.line) ? new vscode.Range(start, end) : null;
    }

    getSelection(): vscode.Selection {
        return vscode.window.activeTextEditor.selection;
    }

    setSelection(start: vscode.Position, end: vscode.Position): void {
        let editor = vscode.window.activeTextEditor;

        editor.selection = new vscode.Selection(start, end);
    }

    /** Behave like Emacs kill command
    */
    kill(): void {
        let saveIsKillRepeated = this.isKillRepeated,
            promises = [
                vscode.commands.executeCommand("emacs.exitMarkMode"),
                vscode.commands.executeCommand("cursorEndSelect")
            ];

        Promise.all(promises).then(() => {
            let selection = this.getSelection(),
                range = new vscode.Range(selection.start, selection.end);

            this.setSelection(range.start, range.start);
            this.isKillRepeated = saveIsKillRepeated;
            if (range.isEmpty) {
                this.killEndOfLine(saveIsKillRepeated, range);
            } else {
                this.killText(range);
            }
        });
    }

    private killEndOfLine(saveIsKillRepeated: boolean, range: vscode.Range): void {
        let doc = vscode.window.activeTextEditor.document,
            eof = doc.lineAt(doc.lineCount - 1).range.end;

        if (doc.lineCount && !range.end.isEqual(eof) &&
            doc.lineAt(range.start.line).rangeIncludingLineBreak) {
            this.isKillRepeated ? this.killRing += '\n' : this.killRing = '\n';
            saveIsKillRepeated = true;
        } else {
            this.setStatusBarMessage("End of buffer");
        }
        vscode.commands.executeCommand("deleteRight").then(() => {
            this.isKillRepeated = saveIsKillRepeated;
        });
    }

    private killText(range: vscode.Range): void {
        let text = vscode.window.activeTextEditor.document.getText(range),
            promises = [
                Editor.delete(range),
                vscode.commands.executeCommand("emacs.exitMarkMode")
            ];

        this.isKillRepeated ? this.killRing += text : this.killRing = text;
        Promise.all(promises).then(() => {
            this.isKillRepeated = true;
        });
    }

    copy(range: vscode.Range = null): boolean {
        this.killRing = '';
        if (range === null) {
            range = this.getSelectionRange();
            if (range === null) {
                vscode.commands.executeCommand("emacs.exitMarkMode");
                return false;
            }
        }
        this.killRing = vscode.window.activeTextEditor.document.getText(range);
        vscode.commands.executeCommand("emacs.exitMarkMode");
        return this.killRing !== undefined;
    }

    cut(): boolean {
        let range: vscode.Range = this.getSelectionRange();

        if (!this.copy(range)) {
            return false;
        }
        Editor.delete(range);
        return true;
    }

    yank(): boolean {
        if (this.killRing.length === 0) {
            return false;
        }
        vscode.window.activeTextEditor.edit(editBuilder => {
            editBuilder.insert(this.getSelection().active, this.killRing);
        });
        this.isKillRepeated = false;
        return true;
    }

    undo(): void {
        vscode.commands.executeCommand("undo");
    }

    private getFirstBlankLine(range: vscode.Range): vscode.Range {
        let doc = vscode.window.activeTextEditor.document;

        if (range.start.line === 0) {
            return range;
        }
        range = doc.lineAt(range.start.line - 1).range;
        while (range.start.line > 0 && range.isEmpty) {
            range = doc.lineAt(range.start.line - 1).range;
        }
        if (range.isEmpty) {
            return range;
        } else {
            return doc.lineAt(range.start.line + 1).range;
        }
    }

    deleteBlankLines(): void {
        let selection = this.getSelection(),
            anchor = selection.anchor,
            doc = vscode.window.activeTextEditor.document,
            range = doc.lineAt(selection.start.line).range,
            promises = [],
            nextLine: vscode.Position;

        if (range.isEmpty) {
            range = this.getFirstBlankLine(range);
            anchor = range.start;
            nextLine = range.start;
        } else {
            nextLine = range.start.translate(1, 0);
        }
        selection = new vscode.Selection(nextLine, nextLine);
        vscode.window.activeTextEditor.selection = selection;
        for (let line = selection.start.line;
             line < doc.lineCount - 1  && doc.lineAt(line).range.isEmpty;
             ++line) {
            promises.push(vscode.commands.executeCommand("deleteRight"));
        }
        Promise.all(promises).then(() => {
            vscode.window.activeTextEditor.selection = new vscode.Selection(anchor, anchor);
        });
    }

    static delete(range: vscode.Range = null): Thenable<boolean> {
        if (range === null) {
            let start = new vscode.Position(0, 0),
                doc = vscode.window.activeTextEditor.document,
                end = doc.lineAt(doc.lineCount - 1).range.end;

            range = new vscode.Range(start, end);
        }
        return vscode.window.activeTextEditor.edit(editBuilder => {
            editBuilder.delete(range);
        });
    }

    setRMode(): void {
        this.setStatusBarPermanentMessage("C-x r");
        this.keybindProgressMode = KeybindProgressMode.RMode; 
        return;
    }

    onType(text: string): void {
        let fHandled = false;
        switch(this.keybindProgressMode)
        {
            case KeybindProgressMode.RMode:
                switch (text)
                {
                    // Rectangles
                    case 'r': // rectangle -> register
                        this.setStatusBarPermanentMessage("Copy rectangle to register:");
                        this.keybindProgressMode = KeybindProgressMode.RModeR;
                        fHandled = true;
                        break;

                    case 'd': // delete rectangle
                        this.setStatusBarMessageAndCleanUp("C-x r d");
                        this.killedRectangle.delete();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    case 'k': // kill rectangle
                        this.setStatusBarMessageAndCleanUp("C-x r k");
                        this.killedRectangle.kill();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    case 'y': // yank rectangle
                        this.setStatusBarMessageAndCleanUp("C-x r y");
                        this.killedRectangle.yank();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    case 'o': // open rectangle
                        this.setStatusBarMessageAndCleanUp("C-x r o");
                        this.killedRectangle.open();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    case 'c': // blank rectangle
                        this.setStatusBarMessageAndCleanUp("C-x r c");
                        this.killedRectangle.blank();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    case 't':
                        this.setStatusBarMessageAndCleanUp("C-x r t");
                        this.killedRectangle.stringify();
                        this.keybindProgressMode = KeybindProgressMode.None;
                        fHandled = true;
                        break;

                    // Registers
                    case 's':
                        this.setStatusBarPermanentMessage("Copy to register:");
                        this.keybindProgressMode = KeybindProgressMode.RModeS;
                        fHandled = true;
                        break;

                    case 'i':
                        this.setStatusBarPermanentMessage("Insert register:");
                        this.keybindProgressMode = KeybindProgressMode.RModeI;
                        fHandled = true;
                        break;

                    default:
                        break;
                }
                break;

            case KeybindProgressMode.RModeS:
                this.setStatusBarPermanentMessage("");
                this.saveTextToRegister(text);
                this.keybindProgressMode = KeybindProgressMode.None;
                fHandled = true;
                break;

            case KeybindProgressMode.RModeI:
                this.setStatusBarPermanentMessage("");
                this.restoreContentFromRegister(text);
                this.keybindProgressMode = KeybindProgressMode.None;
                fHandled = true;
                break;

            case KeybindProgressMode.RModeR:
                this.setStatusBarPermanentMessage("");
                this.registers.set(text, RegisterContent.fromRectangle(RectangleContent.fromActiveSelection(this))); 
                this.keybindProgressMode = KeybindProgressMode.None;
                fHandled = true;
                break;

            case KeybindProgressMode.AMode: // not supported [yet]
            case KeybindProgressMode.None:
            default:
                this.setStatusBarPermanentMessage("");
                this.keybindProgressMode = KeybindProgressMode.None;
                break;
        }

        if (!fHandled) {
            // default input handling: pass control to VSCode
            vscode.commands.executeCommand('default:type', {
                text: text
            });
        }
        return;    
    }

    saveTextToRegister(registerName: string): void {
        if (null == registerName) {
            return;
        }
        let range : vscode.Range = this.getSelectionRange();
        if (range !== null) {
            const selectedText = vscode.window.activeTextEditor.document.getText(range);
            if (null !== selectedText) {
                this.registers.set(registerName, RegisterContent.fromRegion(selectedText));
            }
        }
        return;
    }
    
    restoreContentFromRegister(registerName: string): void {
        vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs 
        const obj : RegisterContent = this.registers.get(registerName);
        if (null == obj) {
            this.setStatusBarMessage("Register does not contain text.");
            return;
        }

        const content : string | vscode.Position | RectangleContent = obj.getRegisterContent();
        switch (obj.getRegisterKind()) {
            case RegisterKind.KText: 
                vscode.window.activeTextEditor.edit(editBuilder => {
                    editBuilder.insert(this.getSelection().active, <string>content);
                });
            break;
            
            case RegisterKind.KPoint:
                // TBD: ...
            break;

            case RegisterKind.KRectangle:
            {
                (<RectangleContent>content).yank();
                // emulate Emacs and set cursor at the botom-left corner of just yanked rectangle
                // TODO: ...
            }   
            break;
        }

        return;
    }

    saveRectangleToRegister(registerName: string): void {
        if (null == registerName) {
            return;
        }

        let rect : RectangleContent = new RectangleContent(this);
        rect.refresh();
        this.registers.set(registerName, RegisterContent.fromRectangle(rect));
        return;
    }
    
}
