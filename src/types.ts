export type Args = {
  directory: string;
};
type Template = {
  name: string;
  template: {
    repo: string;
    owner: string;
  };
};
export type Templates = {
  locations: Template[];
};
export type Answewrs = {
  template: Template;
  createOnGitHub: boolean;
  public: boolean;
};
