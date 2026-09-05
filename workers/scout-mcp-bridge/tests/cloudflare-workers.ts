export class WorkerEntrypoint<Environment = unknown, Properties = unknown> {
  protected env!: Environment;
  protected ctx!: ExecutionContext<Properties>;
}
