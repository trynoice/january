export default interface CdnClient {
  /**
   * Fetch resource from the CDN server located at the given path.
   * @param path Path of the resources relative to the CDN server's root.
   */
  getResource(path: string): Promise<Response> | never;
}
