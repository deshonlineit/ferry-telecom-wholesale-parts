declare module "sharp" {
  const sharp: (input: Buffer, options?: Record<string, unknown>) => any;
  export default sharp;
}