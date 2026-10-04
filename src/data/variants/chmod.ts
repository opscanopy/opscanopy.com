/**
 * chmod variant pages — one entry per common octal mode.
 *
 * Every mechanical fact (symbolic string, ls -l column, canonical command,
 * which classes get which bits) comes from the engine at module scope, so the
 * prose cannot disagree with the calculator the page renders.
 */
import { parseOctal } from '../../lib/chmod-calculator/engine';
import type { Perm } from '../../lib/chmod-calculator/types';
import type { ToolVariant } from './index';

interface Facts {
  symbolic: string;
  ls: string;
  cmd: string;
  owner: string;
  group: string;
  others: string;
}

function grants(p: Perm): string {
  const bits = [p.read && 'read', p.write && 'write', p.execute && 'execute'].filter(Boolean) as string[];
  if (bits.length === 0) return 'no access at all';
  if (bits.length === 1) return `${bits[0]} only`;
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

function facts(octal: string): Facts {
  const r = parseOctal(octal);
  if (!r.valid || !r.state || !r.symbolic || !r.lsStyle || !r.command) {
    throw new Error(`chmod variant ${octal}: engine rejected it (${r.error ?? 'no result'})`);
  }
  return {
    symbolic: r.symbolic,
    ls: r.lsStyle,
    cmd: r.command,
    owner: grants(r.state.user),
    group: grants(r.state.group),
    others: grants(r.state.other),
  };
}

/** The one shared sentence: the digit breakdown, entirely engine-derived. */
function breakdown(octal: string, f: Facts): string {
  if (octal.length === 4) {
    const d = Number(octal[0]);
    const set = [d & 4 && 'setuid', d & 2 && 'setgid', d & 1 && 'sticky'].filter(Boolean).join(' and ');
    return `In \`${octal}\` the first digit is the special-bits digit (4 = setuid, 2 = setgid, 1 = sticky; the values add up to combine them), so ${octal[0]} sets ${set}. The next three digits are owner, group and others: the owner gets ${f.owner}, the group gets ${f.group}, and others get ${f.others}.`;
  }
  return `In \`${octal}\` the first digit is the owner, the second the group and the third everyone else: the owner gets ${f.owner}, the group gets ${f.group}, and others get ${f.others}.`;
}

const f777 = facts('777');
const f755 = facts('755');
const f750 = facts('750');
const f744 = facts('744');
const f700 = facts('700');
const f666 = facts('666');
const f664 = facts('664');
const f644 = facts('644');
const f640 = facts('640');
const f600 = facts('600');
const f555 = facts('555');
const f444 = facts('444');
const f775 = facts('775');
const f400 = facts('400');
const f711 = facts('711');
const f1777 = facts('1777');
const f2775 = facts('2775');
const f4755 = facts('4755');

export const chmodVariants: ToolVariant[] = [
  {
    slug: '777',
    input: '777',
    h1Name: 'chmod 777',
    headline: 'what it means and when to use it',
    title: 'chmod 777 Meaning — Permissions Explained, Visually',
    description:
      'chmod 777 gives read, write and execute to owner, group and everyone else (rwxrwxrwx). What each digit grants, why it is risky, and what to use instead.',
    lede: `\`${f777.cmd}\` sets the mode to \`${f777.symbolic}\`: every user on the system can read, modify and execute the file. It is almost never the right fix, and the safer value is usually 755 or 644.`,
    sections: [
      {
        heading: 'What chmod 777 means',
        paragraphs: [
          breakdown('777', f777),
          `\`ls -l\` shows it as \`${f777.ls}\`. Each 7 is 4 + 2 + 1 — read plus write plus execute — so there is no class left out. On a directory the same bits mean any account can list it, enter it, and create, rename or delete entries inside it, including files that belong to somebody else.`,
        ],
      },
      {
        heading: 'Why 777 is a security problem',
        paragraphs: [
          `A world-writable file can be replaced by any local process, including a compromised web server running as \`www-data\` or \`nginx\`. If that file is a script run by cron or a deploy hook, whoever can write it can run code as the account that executes it. A world-writable directory lets any user drop files into a path another program trusts.`,
          `Shared scratch space such as \`/tmp\` is world-writable on purpose, but it is mode 1777, not 777: the extra sticky bit means users can only delete their own files. A plain 777 directory has no such protection.`,
        ],
      },
      {
        heading: 'When people reach for it, and what to do instead',
        paragraphs: [
          `777 usually appears after a "permission denied" from a web app or a container volume. The real cause is almost always ownership: the process runs as a different user from the one that owns the files. Fix it with \`chown\` to the service account, or by putting that account in the file's group and granting group write, rather than opening the file to every user.`,
          `For code and directories that a server only needs to read, 755 for directories and 644 for files is the conventional pair. For a directory two accounts must both write, give it a shared group and use 775 or 770 with the setgid bit, so new files inherit the group.`,
        ],
      },
      {
        heading: 'Undoing a recursive 777',
        paragraphs: [
          `After \`chmod -R 777\` every file is also executable, which a single recursive command cannot cleanly undo: \`chmod -R 644\` would strip execute from directories and make them impossible to enter. Split the repair by type: \`find dir -type d -exec chmod 755 {} +\` for directories and \`find dir -type f -exec chmod 644 {} +\` for files, then restore execute on the scripts that need it.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Is chmod 777 ever acceptable?',
        a: 'Rarely, and only on a throwaway single-user machine or a scratch directory nobody else can reach. For shared scratch space use 1777 so the sticky bit stops users deleting each other\'s files. On a server or in a container image, fix ownership instead.',
      },
      {
        q: 'Does chmod 777 make a file executable for everyone?',
        a: 'Yes. All three classes get the execute bit, so any user can run the file as a program if its contents are a valid binary or a script with a shebang line. That is one more reason not to apply it to a whole tree.',
      },
    ],
  },
  {
    slug: '755',
    input: '755',
    h1Name: 'chmod 755',
    headline: 'the standard mode for directories and executables',
    title: 'chmod 755 Meaning — rwxr-xr-x Explained',
    description:
      'chmod 755 (rwxr-xr-x): the owner can write, everyone can read and execute. Why it is the default for directories, scripts and binaries, and how to set it.',
    lede: `\`${f755.cmd}\` sets \`${f755.symbolic}\`: only the owner can change the file, while everyone can read it and run it. It is the usual mode for directories, installed binaries and shell scripts.`,
    sections: [
      {
        heading: 'What chmod 755 means',
        paragraphs: [
          breakdown('755', f755),
          `In \`ls -l\` it appears as \`${f755.ls}\`. The 7 is 4 + 2 + 1 and each 5 is 4 + 1, read plus execute. On a directory, read lets a user list the names inside and execute lets them traverse it to open files by path, so 755 is a directory everyone can browse but only the owner can add to or remove from.`,
        ],
      },
      {
        heading: 'Where 755 is the right choice',
        paragraphs: [
          `Most of \`/usr/bin\` is 755, owned by root: every user can run \`ls\` or \`git\`, nobody but root can replace them. The same applies to your own scripts in \`~/bin\` and to web document roots, where the server must enter each directory but should not be able to rewrite the site.`,
          `It is also what \`mkdir\` produces under the common 022 umask, because new directories start from 777 and the umask removes group and other write. When a directory "looks normal" in a listing, it is usually 755.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `755 on a regular data file is harmless but misleading: it marks a config file or an image as executable. Use 644 for files that are only read. And 755 is readable by every account on the host, so it is the wrong mode for anything holding a secret — a directory of credentials wants 700 or 750.`,
          `Do not apply it with \`chmod -R 755\` across a mixed tree; every file becomes executable. Use \`find dir -type d -exec chmod 755 {} +\` for directories and set files separately, or the symbolic form \`chmod -R u=rwX,go=rX dir\`, where capital X adds execute only to directories and to files that were already executable.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "755 sits between two neighbours. 750 removes every bit from others, so only the owner and one group can enter; 700 goes further and keeps the directory to the owner alone. For files that are read but never run, 644 is the counterpart that drops execute everywhere. If you are tempted by 777 because a process cannot write, the problem is ownership, and 755 with the right owner is usually the answer.",
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 755 and 775?',
        a: 'The middle digit. 755 gives the group read and execute only; 775 also gives the group write, so any member of the file\'s group can modify it or, on a directory, create and delete entries. Use 775 for shared project directories with a dedicated group.',
      },
      {
        q: 'Should web files be 755 or 644?',
        a: 'Directories 755, files 644. The web server needs execute on directories to traverse them, but a static HTML, CSS or PHP file only needs to be readable. PHP files are read by the interpreter, not executed by the kernel.',
      },
    ],
  },
  {
    slug: '750',
    input: '750',
    h1Name: 'chmod 750',
    headline: 'owner full access, group read-only, others locked out',
    title: 'chmod 750 Meaning — rwxr-x--- Explained',
    description:
      'chmod 750 (rwxr-x---): owner full control, group read and execute, everyone else nothing. Use it for app and service directories shared with one group.',
    lede: `\`${f750.cmd}\` sets \`${f750.symbolic}\`: the owner has full control, members of the file's group can read and enter it, and every other account is shut out.`,
    sections: [
      {
        heading: 'What chmod 750 means',
        paragraphs: [
          breakdown('750', f750),
          `\`ls -l\` shows \`${f750.ls}\`. The trailing 0 is what sets it apart from 755: the "everyone else" class has no bits, so an unrelated account cannot list the directory, cannot traverse into it, and cannot read a file by its full path even if that file's own mode is world-readable.`,
        ],
      },
      {
        heading: 'Typical uses',
        paragraphs: [
          `750 fits a directory owned by a deploy user and read by a service group. A common layout is \`chown -R deploy:www-data /srv/app\` with directories at 750 and files at 640, so the web server can read the code but not change it, and other local users see nothing.`,
          `Home directories on multi-user hosts are another case. Several distributions now create homes at 750 or 700 rather than the older 755, so one user cannot browse another's files by default.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `The group is the whole design, so check it. If the directory's group is the owner's personal group, 750 behaves like 700 for everyone else. Use \`ls -ld\` to confirm the group, and \`id <user>\` to confirm the service account is actually a member; group changes only apply to new login sessions or restarted services.`,
          `Because others lose traverse permission, a 750 directory hides everything beneath it, regardless of the children's modes. That is useful, but it also breaks things that expected to reach a path inside, such as a static file server running as a user outside the group.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "750 is 755 with the world removed. Its file counterpart is 640, which keeps the same owner-group-nobody shape without execute. If the group does not need to see the contents either, step down to 700. If the files inside only need the owner, pair the 750 directory with 600 files. A group that also needs to create files wants 770, usually with the setgid bit so new entries keep the group.",
        ],
      },
    ],
    faqs: [
      {
        q: 'When should I use 750 instead of 755?',
        a: 'Whenever accounts outside the owner and one group should not be able to read the contents. 755 lets every local user list and read; 750 limits that to the group. On a single-purpose server the difference is small, on a shared host it matters.',
      },
      {
        q: 'What file mode pairs with a 750 directory?',
        a: 'Usually 640: the owner reads and writes, the group reads, others get nothing. Use 750 on files only if group members need to execute them, such as scripts the service runs.',
      },
    ],
  },
  {
    slug: '744',
    input: '744',
    h1Name: 'chmod 744',
    headline: 'an owner-only executable that everyone can read',
    title: 'chmod 744 Meaning — rwxr--r-- Explained',
    description:
      'chmod 744 (rwxr--r--): owner can read, write and run; group and others can only read. Good for owner-run scripts, a poor fit for directories.',
    lede: `\`${f744.cmd}\` sets \`${f744.symbolic}\`: the owner can edit and run the file, while the group and everyone else can read it but not execute it.`,
    sections: [
      {
        heading: 'What chmod 744 means',
        paragraphs: [
          breakdown('744', f744),
          `\`ls -l\` shows \`${f744.ls}\`. Each 4 is read alone. Compared with 755, the group and others lose execute, so the owner is the only account that can run the file directly. Anyone can still copy it, or pass it to an interpreter with \`sh script.sh\` — execute permission does not stop that for scripts.`,
        ],
      },
      {
        heading: 'Where it fits',
        paragraphs: [
          `744 suits a personal maintenance script you want colleagues to be able to read and review but not run from your path by accident, such as a cleanup job in your home directory triggered by your own crontab.`,
          `It is not a security boundary. Since the content is readable, it must not contain passwords or tokens; for that, use 700. And if the script is harmless to run, 755 is simpler and conventional.`,
        ],
      },
      {
        heading: 'Why 744 is odd on a directory',
        paragraphs: [
          `On a directory, read without execute lets group and others list the entry names but not enter the directory or open anything in it. \`ls\` prints the names alongside "Permission denied" errors for their details, and \`cd\` fails. That half-open state is rarely intended; directories almost always want 755, 750 or 700.`,
          `This is the classic \`chmod -R\` trap: applying 744 recursively to a tree gives every subdirectory this broken mode for non-owners. Use \`find dir -type f -exec chmod 744 {} +\` to touch files only.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "The nearest values each change one class. 755 gives group and others execute as well, which is the normal choice for a script anyone may run. 700 removes read from group and others, which is what you want once the script holds anything sensitive. 644 drops the owner's execute too, turning the file back into plain data, and 444 removes write so even the owner gets a read-only copy.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can other users run a 744 script?',
        a: 'Not directly as ./script, because they lack execute. They can still read it, so they can run it with an interpreter such as bash script.sh or python3 script.py. 744 limits convenience, not access to the logic.',
      },
      {
        q: 'Is 744 the same as 755 for the owner?',
        a: 'Yes. The owner digit is 7 in both. The difference is only for group and others, who keep read but lose execute in 744.',
      },
    ],
  },
  {
    slug: '700',
    input: '700',
    h1Name: 'chmod 700',
    headline: 'private to the owner, the mode for ~/.ssh',
    title: 'chmod 700 Meaning — rwx------ and ~/.ssh',
    description:
      'chmod 700 (rwx------): the owner gets full control and nobody else gets anything. The recommended mode for ~/.ssh and other private directories.',
    lede: `\`${f700.cmd}\` sets \`${f700.symbolic}\`: the owner can read, write and execute, and no other non-root account can do anything at all. It is the standard mode for \`~/.ssh\` and private script directories.`,
    sections: [
      {
        heading: 'What chmod 700 means',
        paragraphs: [
          breakdown('700', f700),
          `\`ls -l\` shows \`${f700.ls}\`. On a directory, the two zeros mean other users cannot list it or traverse it, which also hides every file inside, whatever those files' own modes say.`,
        ],
      },
      {
        heading: 'The ~/.ssh case',
        paragraphs: [
          `OpenSSH checks permissions before trusting your keys. With the server's default \`StrictModes yes\`, sshd refuses public-key login if your home directory, \`~/.ssh\` or \`authorized_keys\` is writable by group or others. The conventional fix is \`chmod 700 ~/.ssh\` and \`chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_*\`, leaving the \`.pub\` files at 644 if you like.`,
          `The same reasoning applies to \`~/.gnupg\`, which GnuPG warns about when it is accessible to others, and to any directory holding credentials or tokens.`,
        ],
      },
      {
        heading: 'Other uses and limits',
        paragraphs: [
          `700 is right for a personal script that reads secrets, and for scratch or build directories a single service account owns. Root is not restricted by these bits: an administrator, or anything running as root, can still read the contents. File modes protect users from each other, not from the machine's owner.`,
          `Do not apply 700 recursively to files that are only data; they gain an execute bit they do not need. Give directories 700 and files 600 with a \`find -type d\` / \`find -type f\` split, or \`chmod -R u=rwX,go= dir\`.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "700 is the most private directory mode in this set. 750 opens it to one group, read and traverse only, which is the usual next step when a service must read the contents. 755 opens it to every account. For the files inside, 600 is the matching private mode, and 640 the group-readable one. If you find a private directory at 777, treat its contents as exposed and rotate any secrets in it.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Why does SSH ignore my key after I copied ~/.ssh?',
        a: 'Copies often arrive with looser modes, and sshd with StrictModes refuses keys when ~/.ssh or authorized_keys is group- or world-writable. Set ~/.ssh to 700 and the files inside to 600, and check that your home directory is not group-writable either.',
      },
      {
        q: 'What is the difference between 700 and 600?',
        a: '700 includes execute for the owner and 600 does not. Use 700 on directories, which need execute to be entered, and on scripts; use 600 on private files that are only read and written.',
      },
    ],
  },
  {
    slug: '666',
    input: '666',
    h1Name: 'chmod 666',
    headline: 'readable and writable by every user',
    title: 'chmod 666 Meaning — rw-rw-rw- Explained',
    description:
      'chmod 666 (rw-rw-rw-): every user can read and write, nobody can execute. Why it is the base mode for new files and rarely a mode to set by hand.',
    lede: `\`${f666.cmd}\` sets \`${f666.symbolic}\`: owner, group and everyone else can read and overwrite the file, and nobody can execute it. It is world-writable, so it is almost never a mode to choose deliberately for a regular file.`,
    sections: [
      {
        heading: 'What chmod 666 means',
        paragraphs: [
          breakdown('666', f666),
          `\`ls -l\` shows \`${f666.ls}\`. Each 6 is 4 + 2, read plus write. There is no execute anywhere, which is why 666 is the starting point the kernel uses for new regular files before the umask is applied: under umask 022 a new file becomes 644, under 002 it becomes 664.`,
        ],
      },
      {
        heading: 'Where you actually see 666',
        paragraphs: [
          `Device nodes such as \`/dev/null\`, \`/dev/zero\` and \`/dev/tty\` are \`crw-rw-rw-\`, mode 666, because every process must be able to write to them. That is legitimate for a device; for a regular file it means any local account can change or truncate its contents.`,
          `You also meet it when a program creates a file with an explicit 0666 and the process umask is 0, common in some containers. If files in a volume appear as 666, check the umask of the process that wrote them before reaching for chmod.`,
        ],
      },
      {
        heading: 'Risks and better choices',
        paragraphs: [
          `A world-writable log, config or data file lets any local user plant content another program will trust. Prefer 644 when only the owner writes, 664 when a group shares writing, and 600 when the content is private.`,
          `Note that deleting or renaming a file is controlled by its directory's write permission, not by the file's mode, so 666 does not by itself let others delete the file. It does let them empty it, which is usually just as bad.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "666 is the no-execute counterpart of 777, and shares its main flaw. 664 removes write from others, which is the right choice for files a group edits together. 644 removes group write as well, leaving the owner as the only writer. 600 removes everyone but the owner, and 444 removes write from all three classes when the goal is a read-only file.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Why do new files start at 666 and not 777?',
        a: 'Programs normally request 0666 for regular files and 0777 for directories, and the umask removes bits from that. Files are not given execute by default because most files are data, not programs.',
      },
      {
        q: 'Is 666 safer than 777?',
        a: 'Only slightly. It drops execute, but the file is still writable by every account, which is the main risk. Use 644, 664 or 600 depending on who needs to write.',
      },
    ],
  },
  {
    slug: '664',
    input: '664',
    h1Name: 'chmod 664',
    headline: 'a file the owner and its group can both edit',
    title: 'chmod 664 Meaning — rw-rw-r-- Explained',
    description:
      'chmod 664 (rw-rw-r--): owner and group can read and write, others can read. The default file mode under umask 002 and the usual mode for shared files.',
    lede: `\`${f664.cmd}\` sets \`${f664.symbolic}\`: the owner and members of the file's group can edit it, and everyone else can only read it.`,
    sections: [
      {
        heading: 'What chmod 664 means',
        paragraphs: [
          breakdown('664', f664),
          `\`ls -l\` shows \`${f664.ls}\`. It is what a new file gets when the umask is 002, a setting common on distributions that give each user a private group of the same name, because then group write only reaches the user themself unless the file belongs to a shared group.`,
        ],
      },
      {
        heading: 'Shared project files',
        paragraphs: [
          `664 is the file half of a collaborative directory. Create a group, add the people or services that need to write, \`chgrp -R team /srv/project\`, then use 2775 on directories — the 2 is setgid, so new files inherit the \`team\` group — and 664 on files. Without the setgid bit, each new file takes the creator's primary group and the sharing quietly stops working.`,
          `A process that writes into such a tree should run with umask 002, or the files it creates will come out as 644 and other members lose write.`,
        ],
      },
      {
        heading: 'When not to use it',
        paragraphs: [
          `The last digit still grants read to every account, so 664 is wrong for secrets. If the group should be the only reader, drop to 660. If the file is a program the group runs, use 775 instead so it gains execute.`,
          `And 664 is only as narrow as the group: check membership with \`getent group <name>\`. A broad group such as \`users\` turns 664 into a file most of the machine can edit.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "Every neighbour of 664 changes one digit. 644 takes group write away, the right mode when only the owner edits. 666 adds write for everyone, which defeats the purpose of having a group. 640 keeps the group but removes the world's read access, and 660 (not covered here) does the same while keeping group write. For a group-run script, use 775, or 755 if only the owner should change it.",
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 664 and 644?',
        a: 'The group digit. In 644 the group can only read; in 664 the group can also write. Choose 664 when several accounts in one group need to edit the same files.',
      },
      {
        q: 'Why do my new files come out as 644 instead of 664?',
        a: 'Your umask is 022, which removes group write. Set umask 002 in the shell or service that creates the files, or set the mode explicitly after creating them.',
      },
    ],
  },
  {
    slug: '644',
    input: '644',
    h1Name: 'chmod 644',
    headline: 'the default mode for regular files',
    title: 'chmod 644 Meaning — rw-r--r-- Explained',
    description:
      'chmod 644 (rw-r--r--): owner reads and writes, everyone else reads. The default mode for config files, web content and documents, and when not to use it.',
    lede: `\`${f644.cmd}\` sets \`${f644.symbolic}\`: the owner can edit the file and everyone else can read it, with no execute bit for anyone. It is what most ordinary files are.`,
    sections: [
      {
        heading: 'What chmod 644 means',
        paragraphs: [
          breakdown('644', f644),
          `\`ls -l\` shows \`${f644.ls}\`. The 6 is read plus write and each 4 is read alone. New files come out as 644 under the common 022 umask, so it is the mode you will see on most documents, source files, images and configuration.`,
        ],
      },
      {
        heading: 'Typical 644 files',
        paragraphs: [
          `\`/etc/passwd\`, \`/etc/hosts\` and most of \`/etc\` are 644, owned by root: every program can read them, only root can change them. Static web content — HTML, CSS, JavaScript, images, and PHP source — is conventionally 644, paired with 755 directories, so the server can read but not rewrite the site.`,
          `Public SSH keys (\`id_ed25519.pub\`) can be 644; only the private half needs to be locked down.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `644 is world-readable. An \`.env\` file, a database password in \`config.php\`, or a private key at 644 can be read by every account on the host, and \`ssh\` refuses a private key with this mode outright. Use 600 for those, or 640 if a service group must read them.`,
          `A script at 644 cannot be run as \`./script\`; add execute with \`chmod +x\` or set 755. And never use \`chmod -R 644\` on a directory tree: directories lose execute and nobody, including the owner, can enter them. Use \`find dir -type f -exec chmod 644 {} +\` instead.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "644 has close relatives for each audience. 640 hides the file from everyone outside the group, 600 from everyone but the owner. 664 lets the group edit as well as read. 444 removes the owner's write and makes the file read-only for all. For directories and executables the parallel mode is 755: the same shape, with execute added so the directory can be entered or the program run.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Should a config file be 644 or 600?',
        a: 'It depends on what is in it. A config with no secrets can be 644 so tools and other users can read it. One holding passwords, API keys or tokens should be 600, or 640 with a group the service runs in.',
      },
      {
        q: 'Why can I not cd into a directory after chmod -R 644?',
        a: 'Directories need the execute bit to be traversed, and 644 has none. Restore it with find dir -type d -exec chmod 755 {} + and keep 644 for files only.',
      },
    ],
  },
  {
    slug: '640',
    input: '640',
    h1Name: 'chmod 640',
    headline: 'owner writes, group reads, others see nothing',
    title: 'chmod 640 Meaning — rw-r----- Explained',
    description:
      'chmod 640 (rw-r-----): owner reads and writes, group reads, everyone else has no access. The usual mode for secrets a service group must read.',
    lede: `\`${f640.cmd}\` sets \`${f640.symbolic}\`: the owner can edit the file, its group can read it, and other accounts cannot open it at all.`,
    sections: [
      {
        heading: 'What chmod 640 means',
        paragraphs: [
          breakdown('640', f640),
          `\`ls -l\` shows \`${f640.ls}\`. Compared with 644 the final digit drops to 0, so the file stops being world-readable while the group keeps read access.`,
        ],
      },
      {
        heading: 'Where 640 is used',
        paragraphs: [
          `On Debian and Ubuntu, \`/etc/shadow\` is 640 owned by \`root:shadow\`: only root can change the password hashes, and only programs in the \`shadow\` group can read them. Many log files under \`/var/log\` follow the same pattern with the \`adm\` group, so administrators can read logs without root.`,
          `For applications, 640 is the standard way to give a service a secret without making it world-readable: the deploy user owns the file, the service's group reads it, for example \`chown deploy:www-data .env && chmod 640 .env\`.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `The group must be specific. A file at 640 in a broad group like \`users\` is readable by most of the machine. Also remember that the directory path must be traversable by the group — a 640 file inside a 700 directory is unreachable for the service no matter what its own mode says. 750 is the usual parent.`,
          `Some programs check modes themselves and reject group-readable secrets; SSH private keys and PostgreSQL's \`~/.pgpass\` both want 600. Use 640 only where the consuming program accepts it.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "640 is the middle of a three-step ladder for secrets: 644 is readable by every account, 640 by the owner and one group, 600 by the owner alone. Pick the narrowest the consuming program accepts. The directory mode that pairs with 640 files is 750; 700 would block the group, 755 would let others list file names even though they cannot read the files themselves.",
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 640 and 600?',
        a: '600 lets only the owner read; 640 also lets the file\'s group read. Use 640 when a service running in a different account needs read access through a shared group.',
      },
      {
        q: 'Why can my service still not read a 640 file?',
        a: 'Check three things: the file\'s group matches a group the service account belongs to, the service was restarted after the group change, and every parent directory grants that group execute.',
      },
    ],
  },
  {
    slug: '600',
    input: '600',
    h1Name: 'chmod 600',
    headline: 'owner-only read and write for private keys and secrets',
    title: 'chmod 600 Meaning — rw------- and SSH Keys',
    description:
      'chmod 600 (rw-------): only the owner can read and write. The required mode for SSH private keys and the right default for credentials and .env files.',
    lede: `\`${f600.cmd}\` sets \`${f600.symbolic}\`: the owner can read and write the file, and no other non-root account can open it. It is the mode for private keys, credentials and anything else that should stay with one user.`,
    sections: [
      {
        heading: 'What chmod 600 means',
        paragraphs: [
          breakdown('600', f600),
          `\`ls -l\` shows \`${f600.ls}\`. There is no execute bit anywhere, so 600 is for data files; directories need 700, and private scripts too.`,
        ],
      },
      {
        heading: 'SSH keys and other files that require it',
        paragraphs: [
          `The OpenSSH client checks the mode of a private key and refuses to use one that group or others can read, printing "WARNING: UNPROTECTED PRIVATE KEY FILE!". \`chmod 600 ~/.ssh/id_ed25519\` fixes it. On the server, \`authorized_keys\` is conventionally 600 too.`,
          `Other tools enforce the same rule: libpq ignores a \`~/.pgpass\` that is group- or world-accessible, and many CLI credential files (\`~/.netrc\`, cloud provider credential files, \`.env\`) should be 600 even where nothing checks.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `Mode bits do not protect against root, backups or a copy to another machine: a key copied with \`scp\` or unpacked from an archive can arrive at 644, so recheck after moving it. Containers are a common case — a secret mounted into a container may need its owner set to the container's user, or the process cannot read a 600 file at all.`,
          `If a separate service account must read the file, 600 is too strict; use 640 with a shared group rather than widening it to 644.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "600 is the tightest mode that still lets the owner edit. 640 relaxes it for one group, 644 for everyone. 400 (not covered here) removes the owner's write as well, which some tools such as cloud key downloads set by default, and which ssh also accepts. For directories holding these files, use 700: 600 on a directory would leave out the execute bit the owner needs to enter it.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Why does ssh say my private key permissions are too open?',
        a: 'The key file is readable by group or others, typically 644. ssh refuses such keys. Run chmod 600 on the key, and make sure you own the file.',
      },
      {
        q: 'Should .env files be 600?',
        a: 'Yes, if only the owner reads them. If a web server or app runs as a different account, make the file 640 and give it that account\'s group, so it is still not world-readable.',
      },
    ],
  },
  {
    slug: '555',
    input: '555',
    h1Name: 'chmod 555',
    headline: 'read and execute for all, write for nobody',
    title: 'chmod 555 Meaning — r-xr-xr-x Explained',
    description:
      'chmod 555 (r-xr-xr-x): everyone can read and execute, nobody has write. What a write-protected directory blocks, and why root and the owner can undo it.',
    lede: `\`${f555.cmd}\` sets \`${f555.symbolic}\`: every account can read and run the file or enter the directory, but no class has write. It is a read-only version of 755.`,
    sections: [
      {
        heading: 'What chmod 555 means',
        paragraphs: [
          breakdown('555', f555),
          `\`ls -l\` shows \`${f555.ls}\`. Each 5 is 4 + 1, read plus execute. Compared with 755 only the owner's write bit is gone, and that changes more than it looks.`,
        ],
      },
      {
        heading: 'What removing write does',
        paragraphs: [
          `On a directory, write is what allows creating, renaming and deleting entries. A 555 directory therefore freezes its contents: even the owner cannot add or remove files in it until write comes back, although files inside can still be edited if their own modes allow it. \`/proc\` is mounted \`dr-xr-xr-x\` for this reason.`,
          `On an executable file, 555 stops accidental edits, for example a vendored binary or a release script you do not want a tool to rewrite in place.`,
        ],
      },
      {
        heading: 'Limits',
        paragraphs: [
          `It is a guard rail, not a lock. The owner can always run \`chmod u+w\` again, because changing the mode depends on ownership, not on the write bit. Root ignores read and write bits entirely. For a file that really must not change, use a read-only mount or, on ext4 and similar filesystems, \`chattr +i\`.`,
          `Some tools fail in confusing ways in a 555 tree — package managers, \`git\` and editors that write a temporary file next to the original all need directory write. If a build suddenly reports "Permission denied" on a file you own, check the directory mode.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "555 is 755 without the owner's write. Add write back and you have the ordinary mode for directories and programs. Remove execute and you get 444, read-only data. For a private equivalent, 500 (not covered here) keeps read and execute for the owner only. 777 is the opposite end: every bit, for everyone, including the write that 555 removes.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can the owner modify a 555 file?',
        a: 'Not directly, since there is no write bit. But the owner can restore it with chmod u+w at any time, so 555 prevents accidents rather than deliberate changes.',
      },
      {
        q: 'What is the difference between 555 and 444?',
        a: 'Execute. 555 keeps the execute bit for everyone, so it suits programs and directories that must still be entered. 444 is read-only data with no execute, which makes it unusable on a directory.',
      },
    ],
  },
  {
    slug: '444',
    input: '444',
    h1Name: 'chmod 444',
    headline: 'read-only for everyone, including the owner',
    title: 'chmod 444 Meaning — r--r--r-- Explained',
    description:
      'chmod 444 (r--r--r--): everyone can read, nobody can write or execute. When a read-only file is useful, and why it can still be deleted.',
    lede: `\`${f444.cmd}\` sets \`${f444.symbolic}\`: every account can read the file, and no class can write or execute it. It marks a file as read-only reference data.`,
    sections: [
      {
        heading: 'What chmod 444 means',
        paragraphs: [
          breakdown('444', f444),
          `\`ls -l\` shows \`${f444.ls}\`. Each 4 is read alone. Editors open such a file read-only, and shell redirection into it fails with "Permission denied" for any non-root user, the owner included.`,
        ],
      },
      {
        heading: 'Where it is useful',
        paragraphs: [
          `444 suits generated or reference files you want protected from casual edits: a checked-out lockfile you do not mean to change, a published dataset, or a config a tool should read but never rewrite. It signals intent, and editors will warn before you overwrite it.`,
          `It is not suitable for secrets, because it is world-readable. If only one user should read the file, use 400; for a sudoers-style file readable by a group, 440 is the conventional mode.`,
        ],
      },
      {
        heading: 'Why a 444 file can still be deleted',
        paragraphs: [
          `Deleting a file changes its directory, not the file, so \`rm\` needs write permission on the directory and ignores the file's own mode. GNU \`rm\` asks "remove write-protected regular file?" when run interactively, but \`rm -f\` deletes it without asking. Protect against deletion with a non-writable directory or the sticky bit, not with 444.`,
          `The owner can also undo it with \`chmod u+w\`, and root ignores it. Never use it on a directory: without execute, nobody can enter it, and a recursive \`chmod -R 444\` locks you out of your own tree until you restore execute.`,
        ],
      },
      {
        heading: 'Related values',
        paragraphs: [
          "444 is 644 without the owner's write, and 555 without execute. If others should not read the file, the related modes are 440 for a group and 400 for the owner alone, neither covered here. To make the file editable again, return it to 644, or to 600 if it should also be private. For a directory you want to freeze, use 555, which keeps execute so the directory can still be entered.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I delete a file with chmod 444?',
        a: 'Yes, if you have write permission on its directory. rm may prompt for confirmation, and rm -f skips the prompt. A file\'s mode does not control whether it can be removed.',
      },
      {
        q: 'What is the difference between 444 and 400?',
        a: '444 lets everyone read the file; 400 lets only the owner read it. Both deny write and execute to every class.',
      },
    ],
  },
  {
    slug: '775',
    input: '775',
    h1Name: 'chmod 775',
    headline: 'a directory the owner and its group can both write',
    title: 'chmod 775 Meaning — rwxrwxr-x Explained',
    description:
      'chmod 775 (rwxrwxr-x): owner and group get full access, others read and execute. The mode for shared team directories, and how it differs from 755.',
    lede: `\`${f775.cmd}\` sets \`${f775.symbolic}\`: the owner and every member of the file's group can read, write and enter it, while other accounts can only read and traverse. It is the usual mode for a directory a team shares.`,
    sections: [
      {
        heading: 'What chmod 775 means',
        paragraphs: [
          breakdown('775', f775),
          `\`ls -l\` shows \`${f775.ls}\`. The two 7s are 4 + 2 + 1 and the 5 is 4 + 1. On a directory, group write is the whole point: any group member can create, rename and delete entries inside it, not only the owner. It is also what \`mkdir\` produces under a 002 umask.`,
        ],
      },
      {
        heading: '775 versus 755',
        paragraphs: [
          `The only difference is the middle digit. 755 lets the group read and enter; 775 also lets the group change the contents. Use 755 when one account maintains the files and everybody else consumes them, and 775 when several people or services need to add and edit files in the same place, such as a shared upload area, a build cache or a project checkout on a team server.`,
          `For files, the same split is 644 versus 664. A script the whole group may edit and run can be 775; plain data files in a 775 directory are usually 664.`,
        ],
      },
      {
        heading: 'Make the group stick with 2775',
        paragraphs: [
          `On its own, 775 only helps while files belong to the shared group. A new file normally takes the creating user's primary group, so after a week half the tree belongs to personal groups and the sharing quietly breaks. Setting the directory to 2775 adds the setgid bit, which makes new entries inherit the directory's group instead. The usual recipe is \`chgrp -R team dir\`, \`find dir -type d -exec chmod 2775 {} +\`, and umask 002 for the people and services that write there.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `775 is only as narrow as the group. Check membership with \`getent group <name>\` before relying on it, and avoid broad groups such as \`users\`. The last digit still lets every local account list and read the contents, so drop to 770 if outsiders should see nothing. As with every directory mode, do not apply it with \`chmod -R\` to a mixed tree, or every file becomes executable; split directories and files with \`find\`.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Should I use 775 or 777 for a shared folder?',
        a: '775 with a dedicated group. 777 lets every account on the machine write, while 775 limits writing to the owner and the group. Add the setgid bit (2775) so new files keep the shared group.',
      },
      {
        q: 'Why can a group member still not write to a 775 directory?',
        a: 'Either the directory belongs to a different group, or the user was added to the group after logging in. Check with ls -ld and id, then start a new login session or restart the service.',
      },
    ],
  },
  {
    slug: '400',
    input: '400',
    h1Name: 'chmod 400',
    headline: 'read-only for the owner, nothing for anyone else',
    title: 'chmod 400 Meaning — r-------- and .pem Keys',
    description:
      'chmod 400 (r--------): only the owner can read, and nobody can write or execute. Why AWS tells you to chmod 400 a .pem key, and when to use 600 instead.',
    lede: `\`${f400.cmd}\` sets \`${f400.symbolic}\`: the owner can read the file and no other non-root account can do anything with it. Not even the owner can write to it without changing the mode first, which is what makes it the classic mode for downloaded private keys.`,
    sections: [
      {
        heading: 'What chmod 400 means',
        paragraphs: [
          breakdown('400', f400),
          `\`ls -l\` shows \`${f400.ls}\`. The 4 is read alone and the two zeros remove every bit from the group and others. Compared with 600, the only change is that the owner loses write, so an accidental redirect or an editor save fails instead of silently replacing the contents.`,
        ],
      },
      {
        heading: 'SSH keys and AWS .pem files',
        paragraphs: [
          `The OpenSSH client refuses a private key you own if group or others have any permission bit on it, and prints "UNPROTECTED PRIVATE KEY FILE". Both 400 and 600 satisfy that check, because the rule is about the group and other digits, not the owner's write bit. AWS's EC2 instructions use \`chmod 400 key.pem\` for the key pair you download, which is why so many guides repeat that number.`,
          `Choose 400 for a key that should never change once written, and 600 when a tool needs to rewrite the file in place, for example a credentials file a CLI refreshes. Either is a correct answer for an SSH key.`,
        ],
      },
      {
        heading: 'Other secrets that suit 400',
        paragraphs: [
          `TLS private keys, API tokens written once by a provisioning script, and recovery codes are all good candidates. Configuration-management tools often deploy them at 400 owned by the service account, so the service can read the secret but a bug in it cannot overwrite it.`,
        ],
      },
      {
        heading: 'Limits and pitfalls',
        paragraphs: [
          `400 is not a lock. The owner can run \`chmod u+w\` at any time, root ignores the bits, and \`rm\` only needs write on the directory, so the file can still be deleted. A key copied with \`scp\` or extracted from an archive may arrive at 644, so check the mode after moving it. If a service in another account must read the secret, 400 is too strict; use 440 or 640 with a shared group rather than making it world-readable.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Is chmod 400 or 600 better for an SSH private key?',
        a: 'Both work: ssh only rejects keys that group or others can access. 400 adds protection against accidental overwrites; 600 is more convenient if you ever need to edit or replace the file in place.',
      },
      {
        q: 'Why do I get Permission denied when editing a 400 file I own?',
        a: 'There is no write bit, even for the owner. Run chmod u+w on it, make the change, then chmod 400 again, or edit it as a 600 file if it changes often.',
      },
    ],
  },
  {
    slug: '711',
    input: '711',
    h1Name: 'chmod 711',
    headline: 'others can pass through, but not look around',
    title: 'chmod 711 Meaning — rwx--x--x Explained',
    description:
      'chmod 711 (rwx--x--x): owner full access, everyone else may traverse but not list. Why some systems use it for home directories, and its limits.',
    lede: `\`${f711.cmd}\` sets \`${f711.symbolic}\`: the owner has full control, and every other account gets execute only. On a directory that means others can pass through it to a path they already know, but cannot list what is inside.`,
    sections: [
      {
        heading: 'What chmod 711 means',
        paragraphs: [
          breakdown('711', f711),
          `\`ls -l\` shows \`${f711.ls}\`. Each 1 is the execute bit alone. On a directory, read and execute are separate rights: read lets you list the names, execute lets you traverse the directory and open an entry by name. 711 hands out the second without the first.`,
        ],
      },
      {
        heading: 'Home directories',
        paragraphs: [
          `711 is a common compromise for home directories on shared hosts. Other users cannot run \`ls\` on your home and see what is there, yet a web server can still reach \`~/public_html\` when that subdirectory is itself readable, and a shared file can be opened if someone gives out its full path and the file's own mode allows it. Some hosting control panels and distributions use exactly this mode for that reason.`,
          `Compared with 755, it hides file names. Compared with 700 and 750, it still allows traversal, which is what makes per-user web directories and similar setups work.`,
        ],
      },
      {
        heading: 'Hiding is not protecting',
        paragraphs: [
          `711 relies on names being hard to guess. Well-known paths such as \`.bashrc\`, \`.ssh\` or \`.config\` are trivial to guess, so every file and subdirectory below needs its own sensible mode: 700 on \`~/.ssh\`, 600 on secrets, and so on. If nothing inside needs to be reachable by other accounts, 700 is simpler and stricter. Root, as always, is not limited by any of these bits.`,
        ],
      },
      {
        heading: 'On a file',
        paragraphs: [
          `On a compiled binary, 711 lets everyone run it while only the owner can read its bytes. On a script it does much less: an interpreter has to read the file to run it, so a user without read permission gets "Permission denied" from the shell. Use 755 for scripts others should run.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Can other users read files inside a 711 directory?',
        a: 'Only if they know the exact name and the file itself grants them read. They cannot list the directory to find names, which is why 711 hides contents without blocking access to known paths.',
      },
      {
        q: 'Is 711 or 700 better for a home directory?',
        a: '700 if nothing in it needs to be reachable by other accounts. 711 if a service such as a web server must traverse it to reach a subdirectory like public_html.',
      },
    ],
  },
  {
    slug: '1777',
    input: '1777',
    h1Name: 'chmod 1777',
    headline: 'world-writable with the sticky bit, the /tmp mode',
    title: 'chmod 1777 Meaning — rwxrwxrwt and the Sticky Bit',
    description:
      'chmod 1777 (rwxrwxrwt): anyone can create files, but only a file\'s owner can delete it. How the sticky bit protects /tmp and shared scratch directories.',
    lede: `\`${f1777.cmd}\` sets \`${f1777.symbolic}\`: every account can create files in the directory, but the sticky bit means only the owner of an entry, the directory's owner or root can delete or rename it. It is the mode of \`/tmp\` and \`/var/tmp\`.`,
    sections: [
      {
        heading: 'What chmod 1777 means',
        paragraphs: [
          breakdown('1777', f1777),
          `On a directory such as \`/tmp\`, \`ls -ld\` prints \`d${f1777.symbolic}\`. The \`t\` in the last position is the sticky bit sitting on top of the others' execute bit; a capital \`T\` would mean sticky without execute, which is almost always a mistake.`,
        ],
      },
      {
        heading: 'Why /tmp needs the sticky bit',
        paragraphs: [
          `Normally, deleting or renaming a file is decided by write permission on the directory, not on the file. In a plain 777 directory any user could therefore remove or replace another user's temporary files, which breaks programs and opens the door to swapping a file another process is about to use. The sticky bit narrows that: in a sticky directory, unlinking or renaming an entry also requires owning the entry or the directory.`,
          `Linux adds further protections for these directories, such as the \`fs.protected_symlinks\` setting (enabled by default on most systemd distributions), which stops a process from following a symlink in a sticky world-writable directory unless it owns the link or the link's owner also owns the directory. They complement the sticky bit rather than replace it.`,
        ],
      },
      {
        heading: 'Creating your own shared scratch space',
        paragraphs: [
          `For a drop folder every user must write to, use \`chmod 1777 dir\` or \`chmod +t dir\` on an existing 777 directory, never a bare 777. If only one team should write there, a group-owned 1770 or 3770 directory is tighter still. On a regular file the sticky bit has no effect on Linux, so 1777 only makes sense on directories.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `The sticky bit stops deletion, not reading. Files created in \`/tmp\` get whatever mode the creating process chooses, so a program writing secrets there must create them as 600, ideally with \`mktemp\` to avoid guessable names. And a numeric \`chmod 777\` on \`/tmp\` itself clears the sticky bit; if a system starts misbehaving after a careless recursive chmod, check that \`/tmp\` still shows a trailing \`t\`.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 777 and 1777?',
        a: 'The leading 1 is the sticky bit. Both let everyone create files, but in a 1777 directory only a file\'s owner, the directory owner or root can delete or rename it. In a plain 777 directory anyone can.',
      },
      {
        q: 'How do I restore the correct permissions on /tmp?',
        a: 'Run chmod 1777 /tmp as root and make sure it is owned by root. ls -ld /tmp should then end in a lowercase t.',
      },
    ],
  },
  {
    slug: '2775',
    input: '2775',
    h1Name: 'chmod 2775',
    headline: 'a shared project directory where new files keep the group',
    title: 'chmod 2775 Meaning — rwxrwsr-x and setgid',
    description:
      'chmod 2775 (rwxrwsr-x): a 775 directory with setgid, so new files inherit the directory\'s group. The standard setup for shared project folders.',
    lede: `\`${f2775.cmd}\` sets \`${f2775.symbolic}\`: owner and group can write, others can read and traverse, and the setgid bit makes every new file and subdirectory belong to the directory's group rather than the creator's.`,
    sections: [
      {
        heading: 'What chmod 2775 means',
        paragraphs: [
          breakdown('2775', f2775),
          `\`ls -l\` shows \`${f2775.ls}\`. The \`s\` in the group's execute position is setgid combined with group execute; a capital \`S\` would mean setgid without execute, which on a directory leaves group members unable to enter it.`,
        ],
      },
      {
        heading: 'Why shared directories need setgid',
        paragraphs: [
          `Without setgid, a new file takes the primary group of whoever creates it. In a team directory that means files keep landing in personal groups, and colleagues lose write access even though the directory itself is 775. With setgid on the directory, Linux assigns new entries the directory's group, and new subdirectories inherit the setgid bit too, so the arrangement propagates down the tree on its own.`,
          `A typical setup is \`groupadd web\`, \`chgrp -R web /srv/site\`, \`find /srv/site -type d -exec chmod 2775 {} +\` and \`find /srv/site -type f -exec chmod 664 {} +\`.`,
        ],
      },
      {
        heading: 'The umask still matters',
        paragraphs: [
          `setgid fixes the group, not the mode. A user with the common 022 umask still creates files as 644, so the group can read but not edit them. Set umask 002 for the people and services that write into the tree, for example in the service unit with \`UMask=0002\`, or use default ACLs if you cannot control every writer.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `GNU chmod deliberately preserves setgid on directories when you pass a three-digit mode, so \`chmod 755 dir\` leaves the \`s\` in place. To clear it you need \`chmod g-s dir\` or an explicit leading zero such as \`chmod 00755 dir\`. Files moved into the directory with \`mv\` keep their original group, because only newly created entries inherit it, so run \`chgrp\` after moving content in. On a regular file, setgid means something different: the program runs with the file's group, which is rarely what you want on data.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 775 and 2775?',
        a: 'The leading 2 sets setgid. Both give owner and group write, but in a 2775 directory new files and subdirectories automatically belong to the directory\'s group, so shared access does not erode over time.',
      },
      {
        q: 'Why do files in my 2775 directory have the wrong group?',
        a: 'They were probably moved in with mv, which keeps the original group, or created before setgid was set. Fix them once with chgrp -R; files created from then on inherit the group.',
      },
    ],
  },
  {
    slug: '4755',
    input: '4755',
    h1Name: 'chmod 4755',
    headline: 'setuid: a program that runs as its owner',
    title: 'chmod 4755 Meaning — rwsr-xr-x and setuid',
    description:
      'chmod 4755 (rwsr-xr-x) sets setuid, so the program runs with its owner\'s privileges. How passwd uses it, why it is risky, and how to audit setuid files.',
    lede: `\`${f4755.cmd}\` sets \`${f4755.symbolic}\`: a normal 755 executable plus the setuid bit, so whoever runs it gets the privileges of the file's owner for the life of the process. On a root-owned binary, that means running as root.`,
    sections: [
      {
        heading: 'What chmod 4755 means',
        paragraphs: [
          breakdown('4755', f4755),
          `\`ls -l\` shows \`${f4755.ls}\`. The \`s\` in the owner's execute position is setuid plus execute; a capital \`S\` means setuid is set but execute is not, which does nothing useful.`,
        ],
      },
      {
        heading: 'Where setuid is used',
        paragraphs: [
          `\`passwd\` is the textbook case. Changing your password means writing \`/etc/shadow\`, which only root may modify, so \`/usr/bin/passwd\` is owned by root with mode 4755 and runs with root's effective user ID while it checks who you are and only lets you change your own entry. \`su\`, \`mount\` and \`sudo\` are setuid root for the same reason, though the exact mode differs between distributions.`,
          `These programs are written with their elevated position in mind: they drop privileges early, sanitise their environment and validate every input. An ordinary program is not.`,
        ],
      },
      {
        heading: 'Security warning',
        paragraphs: [
          `A setuid root binary with a bug is a local privilege escalation. Never set 4755 on your own programs to get around a permission problem; use \`sudo\` rules, Linux capabilities with \`setcap\`, or a service running as the right user instead. Never put it on scripts at all. Linux ignores setuid on interpreted scripts that start with a shebang, precisely because the gap between the kernel starting the interpreter and the interpreter opening the script was a classic attack, so the bit gives a false sense of having done something.`,
          `Audit regularly with \`find / -perm -4000 -type f -ls 2>/dev/null\`, which lists every setuid file, and compare it with what your distribution ships. An unexpected entry, especially in a home or \`/tmp\` directory, is a sign of compromise. Filesystems that should never hold such programs can be mounted with the \`nosuid\` option, which makes the kernel ignore the bit.`,
        ],
      },
      {
        heading: 'Removing it',
        paragraphs: [
          `\`chmod u-s file\` clears setuid and keeps everything else; \`chmod 755 file\` does the same for a regular file. Note that writing to a setuid file as a non-root user makes the kernel clear the bit automatically, and \`chown\` clears it too, so re-check the mode after replacing such a binary.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Does setuid work on shell scripts?',
        a: 'No. Linux ignores the setuid bit on interpreted scripts, so a 4755 script runs with the caller\'s privileges. Use sudo with a narrow rule, or a small compiled wrapper reviewed for security, if a script genuinely needs elevated rights.',
      },
      {
        q: 'How do I find all setuid files on a system?',
        a: 'Run find / -perm -4000 -type f as root. It lists every file with the setuid bit; compare the result with your distribution\'s defaults and investigate anything unexpected.',
      },
    ],
  },
];
