import { BaseComponent, Component } from "@flamework/components";
import { onSetupSharedComponent } from "./shared-component-handler";
import { RunService } from "@rbxts/services";
import { GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import {
	ClassProducer,
	CreatePatchBroadcaster,
	IClassProducer,
	createPatchBroadcastReceiver,
} from "@rbxts/reflex-class";
import { BroadcastAction, Producer } from "@rbxts/reflex";
import { remotes } from "../remotes";
import { Constructor } from "@flamework/core/out/utility";
import { SharedComponentInfo } from "../types";
import { Pointer } from "./pointer";

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();

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
	implements Omit<IClassProducer, "Destroy">, onSetupSharedComponent
{
	protected pointer: Pointer | undefined;
	protected abstract state: S;
	private _classProducerLink: IClassProducer;
	protected producer!: Producer<S>;
	protected broadcaster!: ReturnType<typeof CreatePatchBroadcaster<S>>;
	protected receiver!: ReturnType<typeof createPatchBroadcastReceiver>;
	private tree: Constructor[];
	/** @client */
	protected isBlockedServerDispatches = false;

	constructor() {
		super();
		classProducerConstructor(this);
		this._classProducerLink = this as unknown as IClassProducer;
		this.tree = GetInheritanceTree(this.getConstructor(), SharedComponent as Constructor);
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

	/**
	 * @internal
	 * @hidden
	 **/
	public __DispatchFromServer(actions: BroadcastAction[]) {
		if (this.isBlockedServerDispatches) return;
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

	public ResolveReplicationForPlayers(player: Player): boolean {
		return true;
	}

	private _onStartServer() {
		this.broadcaster = CreatePatchBroadcaster({
			producer: this.producer,
			dispatch: (player, actions) => {
				remotes._shared_component_dispatch.fire(player, actions, this.GenerateInfo());
			},

			beforeDispatch: (player: Player, action) => {
				return this.ResolveReplicationForPlayers(player) ? action : undefined;
			},

			beforeHydrate: (player, state) => {
				return this.ResolveReplicationForPlayers(player) ? state : undefined;
			},
		});

		remotes._shared_component_start.connect(
			(player, instance) => instance === this.instance && this.broadcaster.start(player),
		);

		this.producer.applyMiddleware(this.broadcaster.middleware);
	}

	private _onStartClient() {
		this.receiver = createPatchBroadcastReceiver({
			start: () => {
				remotes._shared_component_start.fire(this.instance);
			},
		});

		this.producer.applyMiddleware(this.receiver.middleware);
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

	public destroy() {
		super.destroy();
		this._classProducerLink.Destroy();
		//this.maid.Destroy();
	}
}

const classProducerConstructor = mergeSharedComponent();
