import { Controller, Dependency, Modding, OnInit, Reflect, Service } from "@flamework/core";
import { BroadcastReceiver, Broadcaster, createBroadcastReceiver, createBroadcaster } from "@rbxts/reflex";
import { RunService, Workspace } from "@rbxts/services";
import { Slices } from "../state/slices";
import { remotes } from "../remotes";
import { rootProducer } from "../state/rootProducer";
import { OnlyServer } from "./decorators/only-server";
import { CreateGeneratorId } from "../utilities";
import { Component } from "@flamework/components";
import { SharedComponent } from "./shared-component";
import { Constructor } from "@flamework/core/out/utility";
import { Signal } from "@rbxts/beacon";

export interface onSetupSharedComponent {
	onSetup(): void;
}

type Metadata = string;

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	private receiver!: BroadcastReceiver<typeof Slices>;
	private broadcaster!: Broadcaster;
	private instances = new Map<Metadata, Map<Instance, string>>();
	private idGenerator = CreateGeneratorId(true);
	private isReplicatedMetadata = false;
	private onReplicatedData = new Signal<[]>();

	/**
	 * @deprecated
	 * @hidden
	 */
	public async onInit() {
		Modding.onListenerAdded<onSetupSharedComponent>((component) => {
			if (RunService.IsClient() && !this.isReplicatedMetadata) {
				this.onReplicatedData.Wait();
			}
			component.onSetup();
		});

		RunService.IsServer() && this.serverSetup();
		RunService.IsClient() && this.clientSetup();
	}

	private clientSetup() {
		this.receiver = createBroadcastReceiver({
			start: () => {
				remotes._start.fire();
			},
		});

		const disconnect = rootProducer.subscribe(
			(state) => state.replication.ComponetMetadatas,
			() => {
				this.isReplicatedMetadata = true;
				this.onReplicatedData.Fire();
				disconnect();
			},
		);

		remotes._dispatch.connect((Actions) => {
			this.receiver.dispatch(Actions);
		});

		rootProducer.applyMiddleware(this.receiver.middleware);
	}

	private addNewInstance(instance: Instance, metadata: Metadata, id: string) {
		let instances = this.instances.get(metadata);

		if (!instances) {
			instances = new Map();
			this.instances.set(metadata, instances);
		}

		instances.set(instance, id);
	}

	@OnlyServer
	public AddNewInstance(instance: Instance, metadata: Metadata, id: string) {
		this.addNewInstance(instance, metadata, id);
		remotes._reciveInstanceId.fireAll(instance, metadata, id);
	}

	public GetSharedComponentMetadataId(component: SharedComponent<object>) {
		const identifier = Reflect.getMetadata(getmetatable(component) as object, "identifier") as string;
		if (!identifier) return;

		return rootProducer.getState().replication.ComponetMetadatas.get(identifier);
	}

	private serverSetup() {
		this.registerySharedComponents();
		this.broadcaster = createBroadcaster({
			producers: Slices,

			dispatch: (player, actions) => {
				remotes._dispatch.fire(player, actions);
			},
		});

		rootProducer.applyMiddleware(this.broadcaster.middleware);
		remotes._start.connect((player) => this.broadcaster.start(player));

		remotes._getInstanceId.connect((player, instance, metadata) => {
			const id = this.instances.get(metadata)?.get(instance);
			id && remotes._reciveInstanceId.fire(player, instance, metadata, id);
		});
	}

	private instanceOfSharedComponent(obj: object) {
		let foundObj = getmetatable(obj) as { __index: object };

		while (foundObj) {
			if (foundObj.__index === (SharedComponent as object)) return true;
			foundObj = getmetatable(foundObj.__index) as { __index: object };
		}

		return false;
	}

	private registerySharedComponents() {
		const metadata = new Map<Metadata, string>();
		const components = Modding.getDecorators<typeof Component>();

		components.forEach((component) => {
			const componentConstructor = component.constructor;
			if (!componentConstructor) return;
			if (componentConstructor === (SharedComponent as unknown as Constructor)) return;
			if (!this.instanceOfSharedComponent(componentConstructor)) return;

			const identifier = Reflect.getMetadata(componentConstructor, "identifier") as string;
			if (identifier) metadata.set(identifier, this.idGenerator.Next());
		});

		rootProducer.SetComponentMetadatas(metadata);
	}
}
