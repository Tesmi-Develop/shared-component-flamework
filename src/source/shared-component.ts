import { BaseComponent, Component } from "@flamework/components";
import { onSetupSharedComponent } from "./shared-component-handler";
import { ReplicatedStorage, RunService } from "@rbxts/services";
import { GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import { ClassProducer, IClassProducer } from "@rbxts/reflex-class";
import { remotes } from "../remotes";
import { Constructor } from "@flamework/core/out/utility";
import { SharedComponentInfo } from "../types";
import { Pointer } from "./pointer";
import { ISharedNetwork } from "./network";
import { Atom, ClientSyncer, ServerSyncer, sync, SyncPatch, SyncPayload } from "@rbxts/charm";

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();
const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

const mergeSharedComponent = () => {
	const typedSharedComponent = SharedComponent as object;
	const typedClassProducer = ClassProducer as unknown as { constructor: (self: object) => void };

	for (const [i, v] of pairs(typedClassProducer)) {
		if (i === "constructor") continue;
		typedSharedComponent[i as never] = v as never;
	}

	return typedClassProducer.constructor;
};

export
@Component()
abstract class SharedComponent<S extends object = {}, A extends object = {}, I extends Instance = Instance>
	extends BaseComponent<A, I>
	implements IClassProducer<S>, onSetupSharedComponent
{
	protected pointer: Pointer | undefined;
	protected abstract state: S;
	private _classProducerLink: IClassProducer;
	protected broadcaster!: ServerSyncer<{}>;
	protected receiver!: ClientSyncer<{}>;
	private tree: Constructor[];
	/** @client */
	protected isBlockingServerDispatches = false;
	private isEnableDevTool = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected readonly remotes!: Record<string, ISharedNetwork>;
	protected atom!: Atom<Record<string, unknown>>;
	private broadcastConnection?: () => void;

	constructor() {
		super();
		classProducerConstructor(this);
		this.initSharedActions();

		this._classProducerLink = this as unknown as IClassProducer;
		this.tree = GetInheritanceTree(this.getConstructor(), SharedComponent as Constructor);
	}

	/** @internal @hidden */
	public GetRemote(name: string) {
		return this.remotes[name as never];
	}

	private initSharedActions() {
		const ctor = getmetatable(this) as { onStart?: (context: SharedComponent) => void };
		const original = ctor.onStart;

		ctor.onStart = function (this: SharedComponent) {
			for (const [i, remote] of pairs(this.remotes)) {
				const newRemote = remote as ISharedNetwork;
				newRemote.componentReferense = this;
				newRemote.name = i as string;
			}
			original?.(this);
		};
	}

	private getConstructor() {
		return getmetatable(this) as Constructor<SharedComponent>;
	}

	public GenerateInfo(): SharedComponentInfo {
		return {
			Instance: this.instance,
			Identifier: GetConstructorIdentifier(this.getConstructor()),
			SharedIdentifier: GetConstructorIdentifier(this.tree[this.tree.size() - 1]),
			PointerID: this.pointer ? Pointer.GetPointerID(this.pointer) : undefined,
		};
	}

	/** @client */
	public AttachDevTool() {
		assert(IsClient, "Must be a client");
		this.isEnableDevTool = true;
	}

	/** @client */
	public DisableDevTool() {
		assert(IsClient, "Must be a client");
		this.isEnableDevTool = false;
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public __DispatchFromServer(payload: SyncPayload<{}>) {
		if (this.isBlockingServerDispatches) return;
		this.receiver.sync(payload);

		if (!RunService.IsStudio() || !this.isEnableDevTool) return;
		event.FireServer({
			name: `${getmetatable(this)}_serverDispatch`,
			args: [],
			state: this.atom(),
		});
	}

	/** @hidden **/
	public onSetup() {
		this.pointer?.AddComponent(this);
		IsServer && this._onStartServer();
		IsClient && this._onStartClient();
	}

	public ResolveSyncForPlayer(player: Player, data: S | SyncPatch<S>): S | SyncPatch<S> {
		return data;
	}

	private _onStartServer() {
		this.broadcaster = sync.server({
			atoms: { atom: this.atom },
		});

		this.broadcastConnection = this.broadcaster.connect((player, payload) => {
			const data = this.ResolveSyncForPlayer(player, payload.data as never);
			payload.data = data;

			remotes._shared_component_dispatch.fire(player, payload, this.GenerateInfo());
		});

		remotes._shared_component_start.connect(
			(player, instance) => instance === this.instance && this.broadcaster.hydrate(player),
		);
	}

	private _onStartClient() {
		this.receiver = sync.client({
			atoms: { atom: this.atom },
		});

		remotes._shared_component_start.fire(this.instance);
	}

	// Implement types
	GetState(): S {
		throw "Method not implemented.";
	}
	Subscribe(listener: (state: S, previousState: S) => void): () => void;
	Subscribe<T>(selector: (state: S) => T, listener: (state: T, previousState: T) => void): () => void;
	Subscribe<T>(
		selector: (state: S) => T,
		predicate: ((state: T, previousState: T) => boolean) | undefined,
		listener: (state: T, previousState: T) => void,
	): () => void;
	Subscribe<T>(...args: unknown[]): () => void;
	Subscribe(
		selector?: unknown,
		predicate?: unknown,
		listener?: unknown,
		...rest: unknown[]
	): (() => void) | (() => void) | (() => void) | (() => void) {
		throw "Method not implemented.";
	}
	Dispatch(newState: S): void {
		throw "Method not implemented.";
	}

	/** @hidden **/
	Destroy(): void {
		throw "Method not implemented.";
	}

	public destroy() {
		super.destroy();
		this.broadcastConnection?.();
		this._classProducerLink.Destroy();

		for (const [name, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
	}
}

const classProducerConstructor = mergeSharedComponent();
