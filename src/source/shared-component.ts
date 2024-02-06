import { BaseComponent, Component } from "@flamework/components";
import { SharedComponentHandler } from "./shared-component-handler";
import { Reflect } from "@flamework/core";
import { WrapSubscriber, Subscriber } from "../types";
import { RootState, rootProducer } from "../state/rootProducer";
import Maid from "@rbxts/maid";
import { RunService } from "@rbxts/services";
import { CreateGeneratorId, logAssert, logWarning } from "../utilities";
import { remotes } from "../remotes";
import { Selector } from "@rbxts/reflex";
import { Signal } from "@rbxts/beacon";
import { SelectSharedComponent } from "../state/slices/selectors";

function CallMethod<T extends Callback>(func: T, context: InferThis<T>, ...parameters: Parameters<T>): ReturnType<T> {
	return func(context, ...(parameters as unknown[]));
}

enum Prefix {
	Server = "Server",
	Client = "Client",
}

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();

@Component()
export abstract class SharedComponent<
	S extends object,
	A extends object = {},
	I extends Instance = Instance,
> extends BaseComponent<A, I> {
	private static generatorId = CreateGeneratorId(true);
	protected abstract state: S;
	protected previousState!: S;
	private maid = new Maid();
	private id!: string;
	private prefix!: string;
	private metadataId: string;
	private waitintForReadyState?: Signal<void>;

	constructor(private sharedComponentHandler: SharedComponentHandler) {
		super();

		const sharedComponent = this.sharedComponentHandler.RegisteryDescendantSharedComponent(this);
		this.metadataId = this.sharedComponentHandler.GetSharedComponentMetadataId(sharedComponent)!;
		logAssert(this.metadataId, "Shared component metadata id not found");
		this.onSetup();
	}

	private onSetup() {
		this.applyId();
		this.subcribeState();
		this.initSubscribers();
		this.initDestroyDetection();

		this.maid.GiveTask(() => rootProducer.ClearState(this.GetFullId()));
		RunService.Heartbeat.Once(() => {
			this.waitintForReadyState?.Fire();
			this.waitintForReadyState?.Destroy();
			rootProducer.flush();
		});
	}

	public destroy() {
		super.destroy();
		this.maid.Destroy();
	}

	/**
	 * Get the full ID of the object.
	 *
	 * @return {string} the full ID
	 */
	public GetFullId(): string {
		return `${this.prefix}-${this.metadataId}-${this.id}`;
	}

	/**
	 * Get the state of the object.
	 *
	 * @return {S} the state
	 */
	public GetState(): S {
		return this.state as Readonly<S>;
	}

	/**
	 * Subscribe to changes in the state and attach a listener.
	 *
	 * @param {Selector<S, R>} selector - the selector function
	 * @param {(state: R, previousState: R) => void} listener - the listener function
	 * @param {(state: R) => boolean} [predicate] - optional predicate function
	 * @return {WrapSubscriber} subscriber object
	 */
	public Subscribe<R>(
		selector: Selector<S, R>,
		listener: (state: R, previousState: R) => void,
		predicate?: (state: R, previousState: R) => boolean,
	): WrapSubscriber {
		const disconnect = rootProducer.subscribe(this.wrapSelector(selector), predicate, (state, previousState) => {
			this.updateState();
			listener(state, previousState);
		});
		const subscriber = {
			Disconnect: disconnect,

			OnlyServer: () => {
				if (!IsServer) return disconnect;
				disconnect();

				return disconnect;
			},

			OnlyClient: () => {
				if (!IsClient) return disconnect;
				disconnect();

				return disconnect;
			},
		};

		return subscriber;
	}

	public Dispatch(state: S) {
		this.previousState = this.state;
		this.state = state;
		rootProducer.Dispatch(this.GetFullId(), this.state);
	}

	protected resolveOnDestroy(): "Destroy" | "Keep" {
		return "Destroy";
	}

	private changeId(prefix: Prefix, id: string) {
		this.id && this.sharedComponentHandler.RemoveSharedComponentInstance(this.GetFullId());
		this.id && this.prefix !== Prefix.Server && rootProducer.ClearState(this.id);
		this.id = id;
		this.prefix = prefix;

		this.sharedComponentHandler.RegisterSharedComponentInstance(this, this.GetFullId());

		// This method has to be called in the constructor when the state is not ready yet
		if (!this.state) {
			return;
		}

		if (IsServer || (IsClient && prefix === Prefix.Client)) {
			rootProducer.Dispatch(this.GetFullId(), this.state);
		}

		rootProducer.flush();
	}

	private updateState() {
		const oldState = this.state;
		this.state = (rootProducer.getState(SelectSharedComponent(this.GetFullId())) as S) ?? this.state;

		if (oldState !== this.state) {
			this.previousState = oldState;
		}
	}

	private applyId() {
		if (IsServer) {
			const id = SharedComponent.generatorId.Next();
			this.changeId(Prefix.Server, id);
			this.sharedComponentHandler.AddNewInstance(this.instance, this.metadataId, id);
			return;
		}

		const disconnect = remotes._shared_component_reciveInstanceId.connect((instance, id, metadata) => {
			if (this.prefix === Prefix.Server) return;

			if (instance === this.instance && metadata === this.metadataId) {
				this.changeId(Prefix.Server, id);
			}
		});

		this.maid.GiveTask(disconnect);

		const id = SharedComponent.generatorId.Next();
		this.changeId(Prefix.Client, id);

		this.sharedComponentHandler.GetInstanceById(this.instance, this.metadataId).then((id) => {
			if (!id) {
				logWarning(`Failed to get instance ${id}`);
				return;
			}

			this.changeId(Prefix.Server, id);
		});
	}

	private waitForReadyState() {
		if (this.state) return;

		this.waitintForReadyState ?? (this.waitintForReadyState = new Signal());
		this.waitintForReadyState.Wait();
	}

	private subcribeState() {
		this.previousState = this.state;

		this.maid.GiveTask(
			rootProducer.subscribe(
				(state) => state.replication.ComponentStates.get(this.GetFullId()),
				(state, previousState) => {
					this.state = (state as S) ?? this.state;
					this.previousState = (previousState as S) ?? this.previousState;
				},
			),
		);
	}

	private wrapSelector<R>(selector: Selector<S, R>) {
		return (state: RootState) => {
			const componentState = state.replication.ComponentStates.get(this.GetFullId());
			if (!componentState) {
				return selector(this.state);
			}
			return selector(componentState as S);
		};
	}

	private initDestroyDetection() {
		if (!IsClient) return;
		task.spawn(() => {
			this.waitForReadyState();

			this.maid.GiveTask(
				rootProducer.subscribe(
					(state) => state.replication.ComponentStates.get(this.GetFullId()),
					(state) => {
						if (state) return;
						this.resolveOnDestroy() === "Destroy" ? this.destroy() : this.changeId(Prefix.Client, this.id);
					},
				),
			);
		});
	}

	private initSubscribers() {
		const subscribes = Reflect.getMetadata(this, "Subscribes") as Subscriber<S, unknown>[];
		if (!subscribes) return;

		task.spawn(() => {
			this.waitForReadyState();

			subscribes.forEach((subscriber) => {
				this.maid.GiveTask(
					this.Subscribe(
						subscriber.selector,
						(state, previousState) => CallMethod(subscriber.callback, state as S, previousState as S),
						subscriber.predicate,
					).Disconnect,
				);
			});
		});
	}
}
