declare module "jodit/es2021/jodit.min.js" {
  type JoditFactory = { make(element: HTMLElement, options: never): unknown; atom?<T>(value: T): T };
  export const Jodit: JoditFactory | undefined;
  const bundle: { Jodit?: JoditFactory } | undefined;
  export default bundle;
}
