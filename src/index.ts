import inquirer from "inquirer";
import meow from "meow";
import path from "path";
import fs from "fs/promises";
import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { Octokit } from "@octokit/rest";
import { exec } from "child_process";
import { promisify } from "util";
import { Args, Templates, Answewrs } from "./types";
import chalk from "chalk";

const pexec = promisify(exec);
const CLIENT_ID = "5c6c59e3cae8963ac933";

const cli = meow(
  `
  Usage
    $ @aaronpowell/create-swa-app [directory]
  `,
  {
    importMeta: import.meta,
  }
);

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

    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }

    console.log(`✅ Repo cloned at ${args.directory}`);
    console.log(`👉 Navigate to ${args.directory}`);
    console.log(`\tcd ${args.directory}`);
    console.log(`👉 Install packages`);
    console.log(`\tnpm install`);
    console.log(`🎉 Happy Coding!`);
  } catch (e) {
    console.log(e);
  }
}

async function quizUser(templates: Templates) {
  return await inquirer.prompt<Answewrs>([
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
}

async function getTemplates(): Promise<Templates> {
  const moduleURL = new URL(import.meta.url);

  const templateContents = await fs.readFile(
    path.join(path.dirname(moduleURL.pathname), "..", "templates.json"),
    {
      encoding: "utf8",
    }
  );
  return JSON.parse(templateContents);
}

async function run() {
  console.log(`✨ Welcome to the Azure Static Web App generator ✨`);
  console.log(`Let's get started scaffolding you an app`);

  const args = await normalizeArgs();
  const templates = await getTemplates();
  const answers = await quizUser(templates);

  if (answers.createOnGitHub) {
    const auth = createOAuthDeviceAuth({
      clientType: "oauth-app",
      clientId: CLIENT_ID,
      scopes: ["public_repo", "repo"],
      onVerification(verification) {
        console.log(`Open ${chalk.green(verification.verification_uri)}`);
        console.log(`Enter code: ${chalk.cyan(verification.user_code)}`);
      },
    });

    const tokenAuth = await auth({ type: "oauth" });

    console.log(`✅ Logged into GitHub`);

    const octokit = new Octokit({
      auth: tokenAuth.token,
    });

    const repo = await octokit.repos.createUsingTemplate({
      template_owner: answers.template.template.owner,
      template_repo: answers.template.template.repo,
      name: path.basename(args.directory),
      private: !answers.public,
    });

    console.log(`✅ Repo created at ${repo.data.html_url}`);

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
