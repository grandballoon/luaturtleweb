// lua-highlight.js
// Lua syntax highlighting for the editor and for code shown outside it.
//
// Owns the pattern for turtle commands, which the editor highlights with an
// overlay (app.js), and highlightLua(), which gives static code the classes
// the editor would: CodeMirror's Lua mode plus that same pattern. Static
// code shown in an element with the editor's theme class (cm-s-turtle)
// looks exactly like the same code typed into the editor.

// Matches a turtle command at the start of the text.
export const TURTLE_COMMANDS = /^(forward|back|left|right|fd|bk|lt|rt|penup|pendown|pu|pd|pensize|pencolor|fillcolor|color|bgcolor|clear|reset|undo|speed|position|heading|isdown|filling|isvisible|hideturtle|showturtle|xcor|ycor|distance|towards|setheading|seth|home|setpos|setx|sety|teleport|circle|begin_fill|end_fill|dot|write|stamp|clearstamp|clearstamps|Turtle|tracer|update|done)\b/;

// Replaces the contents of `into` with `code`, highlighted. Needs
// CodeMirror's runmode addon.
export function highlightLua(code, into) {
    into.replaceChildren();
    CodeMirror.runMode(code, 'lua', (text, style) => {
        const token = TURTLE_COMMANDS.exec(text);
        if (token && token[0] === text) style = style ? `${style} turtle-cmd` : 'turtle-cmd';
        if (!style) return into.append(text);
        const span = document.createElement('span');
        span.className = `cm-${style.replace(/ +/g, ' cm-')}`;
        span.textContent = text;
        into.append(span);
    });
}
