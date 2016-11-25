import * as vscode from 'vscode';
import {Editor} from './editor';

class LocAndSize {
    public readonly activePosX : number;
    public readonly activePosY : number;
    public readonly rectHeight : number;
    public readonly rectWidth  : number;

    constructor (X : number, Y : number, H : number, W : number) {
        this.activePosX = X;
        this.activePosY = Y;
        this.rectHeight = H;
        this.rectWidth  = W;
    }
};

export class RectangleContent {
    private parent : Editor;
    private defaultStringifyValue : string;
    private content: Array<string>;

    constructor (parent : Editor) {
        this.parent = parent;
        this.defaultStringifyValue = "";
        this.content = [];
    }

    static fromActiveSelection(parent : Editor)  : RectangleContent {
        let rect : RectangleContent = new RectangleContent(parent);
        rect.refresh();
        return rect;
    }

    // Update/Refresh rectangle from current Editor's selection
    refresh() { 
        if (null == this.parent) {
            return;
        }

        const coords : Array<vscode.Range>  = this.GetSelectedRows();
        this.content = RectangleContent.GetSelectedText(coords);

        return;
    }

    // Empty/Clear current rectangle
    empty() {
        if (null == this.parent) {
            return;
        }

        return;    
    }

    // Yank rectangle into Editor at current mark
    yank() {
        if (null == this.parent) {
            return;
        }

        vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs

        const las : LocAndSize = this.GetCurrentLocAndSize();

        vscode.window.activeTextEditor.edit(editBuilder => {
            // Now Yank rectangle
            const totalLinesInDocument : number = vscode.window.activeTextEditor.document.lineCount;
            let jx : number = 0;
            for (jx = 0; (jx < las.rectHeight) && (las.activePosY + jx < totalLinesInDocument); jx++) {
                const currentLine : vscode.TextLine = vscode.window.activeTextEditor.document.lineAt(las.activePosY + jx);
                const currentLineEndX : number = currentLine.range.end.character;
                // depending on the active position and the length of current line, padding might be needed
                const padding : string = (las.activePosX <= currentLineEndX) ? "" : " ".repeat(las.activePosX - currentLineEndX);
                if (padding.length > 0) {
                    editBuilder.insert(new vscode.Position(las.activePosY + jx, currentLineEndX), padding);
                }
                editBuilder.insert(new vscode.Position(las.activePosY + jx, las.activePosX), this.content[jx]);
            }

            // insert the lines that do not exist yet
            let postfix : string = "";
            for (;jx < las.rectHeight; jx++) {
                postfix += "\r\n" + " ".repeat(las.activePosX) + this.content[jx];
            }
            if (postfix.length > 0) {
                editBuilder.insert(new vscode.Position(totalLinesInDocument + 1, 0), postfix);
            }

            // emulate Emacs and set cursor at the botom-left corner of just inserted rectangle
            // Known problems: 
            // 1) Setting up cursor position inside transaction sometimes leads to 
            //    unexpected results.
            // 2) VSCode Extension API does not seem to treat cursor movement inside editBuilder 
            //    function as part of transaction.
            //
            // @okia: comment for now, INVESTIGATE ! 
            // const newX : number = las.activePosX + las.rectWidth; 
            // const newY : number = las.activePosY + las.rectHeight - 1;
            // console.log("activePosX="+las.activePosX+",activePosY="+las.activePosY+",newX="+newX+",newY="+newY); 
            // const newPosition : vscode.Position = new vscode.Position(newY, newX);
            // this.parent.setSelection(newPosition, newPosition);
        });
        
        return;
    }

    // Note: Unlike "kill", "delete" does not save rectangle's content ...
    delete() : void {
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
    
    // replace rectangle content with string on each line
    stringify(): void {
        if (null == this.parent) {
            return;
        }

        // emulate emacs: ask for string anyway, whether rectangle is empty or not
        const myPrompt : string = (0 == this.defaultStringifyValue.length) ?
          "String rectangle (default):" : 
          "String rectangle (default '" + this.defaultStringifyValue + "'):";

        vscode.window.showInputBox({ prompt: myPrompt })
            .then((val: string) => {
                if (val != undefined) {
                    const coords: Array<vscode.Range> = this.GetSelectedRows();
                    const las: LocAndSize = this.GetCurrentLocAndSize();
                    if (!RectangleContent.IsRectangleEmpty(coords)) {
                        vscode.commands.executeCommand("emacs.exitMarkMode"); // emulate Emacs 
                        vscode.window.activeTextEditor.edit(editBuilder => {
                            for (let ix: number = 0; ix < coords.length; ix++) {
                                editBuilder.replace(coords[ix], val);
                            }
                        // TODO: emulate Emacs, move mark appropriately
                        // ...
                        });
                    } else {
                        vscode.window.activeTextEditor.edit(editBuilder => {
                            editBuilder.insert(new vscode.Position(las.activePosY, las.activePosX), val);
                        // TODO: emulate Emacs, move mark appropriately
                        // ...
                        });
                    }

                    this.defaultStringifyValue = val;
                }
            });

        return;
    }

    // get rectangle "location"
    public GetCurrentLocAndSize() : LocAndSize {
        const activeSelection : vscode.Position = this.parent.getSelection().active;
        const activePosX : number = activeSelection.character;
        const activePosY : number = activeSelection.line;
        const rectHeight : number = this.getContentHeight();
        const rectWidth  : number = this.getContentWidth();
        return new LocAndSize(activePosX, activePosY, rectHeight, rectWidth);
    }

    // *** Helpers
    private getContentHeight() {
       return (null == this.content) ? 0 : this.content.length; 
    }

    private getContentWidth() {
       return ((null == this.content) || (0 == this.content.length)) ? 0 : this.content[0].length; 
    }

    private GetSelectedRows() : Array<vscode.Range> {
        const range: vscode.Range = this.parent.getSelectionRange();
        if (null == range) {
            return;
        }

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

