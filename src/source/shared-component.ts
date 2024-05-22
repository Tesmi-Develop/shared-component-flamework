import { BaseComponent, Component } from "@flamework/components";
import { onSetupSharedComponent } from "./shared-component-handler";
import { ReplicatedStorage, RunService } from "@rbxts/services";
import { GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import {
	ClassProducer,
	CreatePatchBroadcaster,
	IClassProducer,
	createPatchBroadcastReceiver,
} from "@rbxts/reflex-class";
import { BroadcastAction, Producer, ProducerMiddleware } from "@rbxts/reflex";
import { remotes } from "../remotes";
import { Constructor } from "@flamework/core/out/utility";
import { SharedComponentInfo } from "../types";
import { Pointer } from "./pointer";
import { ISharedNetwork } from "./shared-component-network";

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
	implements IClassProducer, onSetupSharedComponent
{
	protected pointer: Pointer | undefined;
	protected abstract state: S;
	private _classProducerLink: IClassProducer;
	protected producer!: Producer<S>;
	protected broadcaster!: ReturnType<typeof CreatePatchBroadcaster<S>>;
	protected receiver!: ReturnType<typeof createPatchBroadcastReceiver>;
	private tree: Constructor[];
	/** @client */
	protected isBlockingServerDispatches = false;
	private isEnableDevTool = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected readonly remotes!: Record<string, ISharedNetwork>;

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
	public __DispatchFromServer(actions: BroadcastAction[]) {
		if (this.isBlockingServerDispatches) return;

		return this.receiver.dispatch(actions);
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public onSetup() {
		this.pointer?.AddComponent(this);
		IsServer && this._onStartServer();
		IsClient && this._onStartClient();
	}

	public ResolveDispatchForPlayer(player: Player, action: BroadcastAction): boolean {
		return true;
	}

	public ResolveHydrateForPlayer(player: Player, state: S): S | undefined {
		return;
	}

	private _onStartServer() {
		this.broadcaster = CreatePatchBroadcaster({
			producer: this.producer,
			dispatch: (player, actions) => {
				remotes._shared_component_dispatch.fire(player, actions, this.GenerateInfo());
			},

			beforeDispatch: (player: Player, action) => {
				return this.ResolveDispatchForPlayer(player, action) ? action : undefined;
			},

			beforeHydrate: (player, state) => {
				return this.ResolveHydrateForPlayer(player, state);
			},
		});

		remotes._shared_component_start.connect(
			(player, instance) => instance === this.instance && this.broadcaster.start(player),
		);

		this.producer.applyMiddleware(this.broadcaster.middleware);
	}

	private _onStartClient() {
		const componentName = `${getmetatable(this)}`;
		this.receiver = createPatchBroadcastReceiver({
			start: () => {
				remotes._shared_component_start.fire(this.instance);
			},

			OnHydration: (state) => {
				this.state = state as S;
			},

			OnPatch: (action) => {
				this.state = this.producer.getState();
				if (!this.isEnableDevTool) return;

				event.FireServer({
					name: `${componentName}_serverDispatch`,
					args: [action],
					state: this.producer.getState(),
				});
			},
		});

		const devToolMiddleware: ProducerMiddleware = () => {
			return (nextAction, actionName) => {
				return (...args) => {
					const state = nextAction(...args);
					if (RunService.IsStudio() && event && this.isEnableDevTool) {
						event.FireServer({ name: `${componentName}_dispatch`, args: [...args], state });
					}

					return state;
				};
			};
		};

		this.producer.applyMiddleware(this.receiver.middleware, devToolMiddleware);
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

	/**
	 * @internal
	 * @hidden
	 **/
	Destroy(): void {
		throw "Method not implemented.";
	}

	public destroy() {
		super.destroy();
		this.broadcaster?.destroy();
		this._classProducerLink.Destroy();

		for (const [name, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
	}
}

const classProducerConstructor = mergeSharedComponent();
