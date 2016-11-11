import * as vscode from 'vscode';
import {Editor} from './editor';

export class RectangleContent {
    private parent : Editor;
    private content: Array<string> = [];

    constructor (parent : Editor) {
        this.parent = parent;
    }

    getContentHeight() {
       return (null == this.content) ? 0 : this.content.length; 
    }

    getContentWidth() {
       return (null == this.content) ? 0 : this.content[0].length; 
    }

    // Update/Refresh rectangle from current Editor's selection
    refresh() { 
        console.log('Update rectangle content');
        if (null == this.parent) {
            return;
        }

        const coords : Array<vscode.Range>  = this.GetSelectedRows();
        this.content = RectangleContent.GetSelectedText(coords);

        return;
    }

    // Empty/Clear current rectangle
    empty() {
        console.log('Empty rectangle content');
        if (null == this.parent) {
            return;
        }

        return;    
    }

    // Yank rectangle into Editor at current mark
    yank() {
        console.log('Yank rectangle');
        if (null == this.parent) {
            return;
        }

        vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs

        const activeSelection : vscode.Position = this.parent.getSelection().active;
        const activePosX : number = activeSelection.character;
        const activePosY : number = activeSelection.line;
        const rectHeight : number = this.getContentHeight();
        const rectWidth  : number = this.getContentWidth();

        vscode.window.activeTextEditor.edit(editBuilder => {
            // Now Yank rectangle
            const totalLinesInDocument : number = vscode.window.activeTextEditor.document.lineCount;
            let jx : number = 0;
            for (jx = 0; (jx < rectHeight) && (activePosY + jx < totalLinesInDocument); jx++) {
                const currentLine : vscode.TextLine = vscode.window.activeTextEditor.document.lineAt(activePosY + jx);
                const currentLineEndX : number = currentLine.range.end.character;
                // depending on the active position and the length of current line, padding might be needed
                const padding : string = (activePosX <= currentLineEndX) ? "" : " ".repeat(activePosX - currentLineEndX);
                if (padding.length > 0) {
                    editBuilder.insert(new vscode.Position(activePosY + jx, currentLineEndX), padding);
                }
                editBuilder.insert(new vscode.Position(activePosY + jx, activePosX), this.content[jx]);
            }

            // insert the lines that do not exist yet
            let postfix : string = "";
            for (;jx < rectHeight; jx++) {
                postfix += "\r\n" + " ".repeat(activePosX) + this.content[jx];
            }
            if (postfix.length > 0) {
                editBuilder.insert(new vscode.Position(totalLinesInDocument + 1, 0), postfix);
            }

            // Known problem - making cursor movement part of the transaction seems to be non-trivial
            // TODO: investigate!
            // emulate Emacs and set cursor at the upper-botom of just inserted rectangle
            // const newPosition : vscode.Position = activeSelection.translate(rectHeight, rectWidth-1);
            // this.parent.setSelection(newPosition, newPosition);
        });
        
        return;
    }

    // Note: Unlike "kill", "delete" does not save rectangle's content ...
    delete() : void {
        console.log('Delete rectangle');
        if (null == this.parent) {
            return;
        }

        const coords : Array<vscode.Range>  = this.GetSelectedRows();

        if (!RectangleContent.IsRectangleEmpty(coords)) {
            vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs 
            vscode.window.activeTextEditor.edit(editBuilder => {
                for (let ix : number = 0; ix < coords.length; ix++) {
                    editBuilder.delete(coords[ix]);
                }
            });
        }
        return;
    }
    
    // Kill rectangle at current mark
    kill() : void {
        console.log('Kill rectangle');
        if (null == this.parent) {
            return;
        }
        
        const coords : Array<vscode.Range>  = this.GetSelectedRows();
        this.content = RectangleContent.GetSelectedText(coords);

        if (!RectangleContent.IsRectangleEmpty(coords)) {
            vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs 
            vscode.window.activeTextEditor.edit(editBuilder => {
                for (let ix : number = 0; ix < coords.length; ix++) {
                    editBuilder.delete(coords[ix]);
                }
            });
        }
        return;
    }

    // blank rectangle
    blank() : void {
        console.log('blank rectangle');

        if (null == this.parent) {
            return;
        }

        const coords : Array<vscode.Range>  = this.GetSelectedRows();
        const padding : string = " ".repeat(RectangleContent.GetSelectedRowsWidth(coords));

        if (!RectangleContent.IsRectangleEmpty(coords)) {
            vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs 
            vscode.window.activeTextEditor.edit(editBuilder => {
                for (let ix : number = 0; ix < coords.length; ix++) {
                    editBuilder.replace(coords[ix], padding);
                }
                // TODO: emulate Emacs, move mark appropriately
                // ...
            });
        }
        return;
    }

    // open rectangle
    open() : void {
        console.log('open rectangle');

        if (null == this.parent) {
            return;
        }

        const coords : Array<vscode.Range>  = this.GetSelectedRows();
        const padding : string = " ".repeat(RectangleContent.GetSelectedRowsWidth(coords));

        if (!RectangleContent.IsRectangleEmpty(coords)) {
            vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs
            vscode.window.activeTextEditor.edit(editBuilder => {
                for (let ix : number = 0; ix < coords.length; ix++) {
                    editBuilder.insert(coords[ix].start, padding);
                }
                // TODO: emulate Emacs, move mark to the beginning of the rectangle
            });
             
        }
        return;
    }
    
    // save rectangle to register
    saveToRegister(registerName: string) : void {

        return;
    }

    // *** Helpers
    private GetSelectedRows() : Array<vscode.Range> {
        const range: vscode.Range = this.parent.getSelectionRange();
        if (null == range) {
            return;
        }
        console.log("Range(" + range.start.line + "," + range.start.character + "," + range.end.line + "," + range.end.character  + ")");

        let rect : Array<vscode.Range> = [];
        for (let jx : number = range.start.line; jx <= range.end.line; jx++) {
            const lineRange : vscode.Range = new vscode.Range(new vscode.Position(jx, range.start.character), new vscode.Position(jx, range.end.character)); 
            rect.push(lineRange);
        }

        return rect;
    }

    private static GetSelectedRowsHeight(rect : Array<vscode.Range>) : number {
        return (null == rect) ? 0 : rect.length;
    }

    private static GetSelectedRowsWidth(rect : Array<vscode.Range>) : number {
        return (null == rect) ? 0 : (rect[0].end.character - rect[0].start.character);
    }

    private static IsRectangleEmpty(rect : Array<vscode.Range>) : boolean {
        return ( (0 === RectangleContent.GetSelectedRowsWidth(rect)) || (0 === RectangleContent.GetSelectedRowsHeight(rect)));
    }

    private static GetSelectedText(rowRanges : Array<vscode.Range>) : Array<string> {
        if (null == rowRanges) {
            return;
        }

        let content : Array<string> = [];

        for (let jx : number = 0; jx < rowRanges.length; jx++) {
            content.push(vscode.window.activeTextEditor.document.getText(rowRanges[jx]));            
        }

        return content;
    }
    
};

