import inquirer from "inquirer";
import meow from "meow";
import path from "path";
import fs from "fs/promises";
import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { Octokit } from "@octokit/rest";
import { exec } from "child_process";
import { promisify } from "util";

const pexec = promisify(exec);

const cli = meow(
  `
  Usage
    $ @aaronpowell/create-swa-app [directory]
  `,
  {
    importMeta: import.meta,
  }
);

type Args = {
  directory: string;
};

type Template = {
  name: string;
  template: {
    repo: string;
    owner: string;
  };
};
type Templates = {
  locations: Template[];
};

type Answewrs = {
  template: Template;
  createOnGitHub: boolean;
  public: boolean;
};

async function normalizeArgs(): Promise<Args> {
  let directory = cli.input[0];
  if (!directory) {
    ({ directory } = await inquirer.prompt({
      type: "input",
      name: "directory",
      message:
        "What directory should @aaronpowell/create-swa-app generate your app into?",
      validate: (x) => !!x,
    }));
    process.stdout.write("\n");
  }
  return {
    directory: path.resolve(directory),
  };
}

async function cloneRepo(clone_url: string, args: Args) {
  try {
    const { stdout, stderr } = await pexec(
      `git clone ${clone_url} ${args.directory}`
    );

    if (stderr) {
      console.error(stderr);
    }
    console.log(stdout);
  } catch (e) {
    console.log(e);
  }
}

async function run() {
  const args = await normalizeArgs();

  const moduleURL = new URL(import.meta.url);

  const templateContents = await fs.readFile(
    path.join(path.dirname(moduleURL.pathname), "..", "templates.json"),
    {
      encoding: "utf8",
    }
  );
  const templates: Templates = JSON.parse(templateContents);

  const answers = await inquirer.prompt<Answewrs>([
    {
      type: "list",
      name: "template",
      message: "Which template do you want to use?",
      choices: templates.locations.map((t) => t.name),
      filter: (input: string) => {
        return templates.locations.find((t) => t.name === input);
      },
    },
    {
      type: "confirm",
      name: "createOnGitHub",
      message: "Create a GitHub repo from the template?",
      default: true,
    },
    {
      type: "list",
      name: "public",
      message: "What type of repo access?",
      choices: ["Public", "Private"],
      filter: (input: string) => {
        return input.toLowerCase() === "public";
      },
      when: (answer) => answer.createOnGitHub,
    },
  ]);

  if (answers.createOnGitHub) {
    const auth = createOAuthDeviceAuth({
      clientType: "oauth-app",
      clientId: "5c6c59e3cae8963ac933",
      scopes: ["public_repo", "repo"],
      onVerification(verification) {
        console.log("Open %s", verification.verification_uri);
        console.log("Enter code: %s", verification.user_code);
      },
    });

    const tokenAuth = await auth({ type: "oauth" });

    console.log("Token received, creating repo");

    const octokit = new Octokit({
      auth: tokenAuth.token,
    });

    const repo = await octokit.repos.createUsingTemplate({
      template_owner: answers.template.template.owner,
      template_repo: answers.template.template.repo,
      name: path.basename(args.directory),
      private: !answers.public,
    });

    await cloneRepo(repo.data.clone_url, args);
  } else {
    const octokit = new Octokit();
    const repo = await octokit.repos.get({
      owner: answers.template.template.owner,
      repo: answers.template.template.repo,
    });

    await cloneRepo(repo.data.clone_url, args);
  }
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(-1);
}
