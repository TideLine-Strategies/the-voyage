import {execFileSync} from 'node:child_process';
const account='q.stewart@tidelinestrats.com';
const common=`tell application "Mail"
set a to first account whose name is "${account}"
if (email addresses of a) does not contain "${account}" then error "Wrong sender account"
`;
export function sentDigest(subject){
 const script=`on run argv\nset wanted to item 1 of argv\n${common}repeat with b in mailboxes of a\nif name of b contains "Sent" then\nset ms to (messages of b whose subject is wanted)\nrepeat with m in ms\nset recipientAddresses to address of every to recipient of m\nif recipientAddresses contains "q.stewart@tidelinestrats.com" and recipientAddresses contains "c.knudsen@tidelinestrats.com" and sender of m contains "q.stewart@tidelinestrats.com" then return message id of m\nend repeat\nend if\nend repeat\nend tell\nreturn ""\nend run`;
 return execFileSync('/usr/bin/osascript',['-',''+subject],{input:script,encoding:'utf8',timeout:45000}).trim();
}
export function sendDigest(subject,bodyFile){
 const script=`on run argv\nset subjectText to item 1 of argv\nset bodyText to read (POSIX file (item 2 of argv)) as «class utf8»\n${common}set m to make new outgoing message with properties {subject:subjectText, content:bodyText, sender:"${account}", visible:false}\ntell m\nmake new to recipient at end of to recipients with properties {address:"q.stewart@tidelinestrats.com"}\nmake new to recipient at end of to recipients with properties {address:"c.knudsen@tidelinestrats.com"}\nend tell\nreturn send m\nend tell\nend run`;
 return execFileSync('/usr/bin/osascript',['-',subject,bodyFile],{input:script,encoding:'utf8',timeout:45000}).trim()==='true';
}
