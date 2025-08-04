import { BaseComponent, Component, Components } from "@flamework/components";
import { AbstractConstructor, ConstructorRef } from "@flamework/components/out/utility";
import { Controller, Modding, OnInit, Reflect, Service } from "@flamework/core";
import { SyncPayload } from "@rbxts/charm-sync";
import { Players } from "@rbxts/services";
import { remotes } from "../remotes";
import { PlayerAction, SharedComponentInfo } from "../types";
import { GetConstructorIdentifier, GetParentConstructor, IsClient, IsServer, logWarning } from "../utilities";
import { ACTION_GUARD_FAILED, PLAYER_NOT_CONNECTED, SharedRemoteAction } from "./network/action";
import {
	IsSharedComponentRemoteEvent,
	SharedRemoteEventClientToServer,
	SharedRemoteEventServerToClient,
} from "./network/event";
import { Pointer } from "./pointer";
import { SharedComponent, WaitForClientSharedComponent } from "./shared-component";

export interface onSetupSharedComponent {
	onSetup(): void;
}

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	private classParentCache = new Map<AbstractConstructor, readonly AbstractConstructor[]>();
	private polymorphicIds = new Map<AbstractConstructor, readonly string[]>();

	constructor(private components: Components) {}

	/** @hidden */
	public onInit() {
		const componentConfigs = Modding.getDecorators<typeof Component>();

		componentConfigs.forEach(({ constructor }) => {
			if (!constructor) return;
			this.polymorphicIds.set(constructor, this.getPolymorphicIds(constructor));
		});

		Modding.onListenerAdded<onSetupSharedComponent>((val) => val.onSetup());
		IsClient && this.onClientSetup();
		IsServer && this.onServerSetup();
	}

	private getSharedComponentChild(componentSpecifier: string) {
		let found: string | undefined;

		this.polymorphicIds.forEach((ids, component) => {
			const index = ids.indexOf(componentSpecifier);
			if (index === 0 || index === -1) return;

			found = ids[0];
		});

		return found;
	}

	private getOrderedParents(ctor: AbstractConstructor, omitBaseComponent = true) {
		const cache = this.classParentCache.get(ctor);
		if (cache) return cache;

		const classes = [ctor];
		let nextParent: AbstractConstructor | undefined = ctor;
		while ((nextParent = GetParentConstructor(nextParent)) !== undefined) {
			if (!omitBaseComponent || nextParent !== BaseComponent) {
				classes.push(nextParent);
			}
		}

		this.classParentCache.set(ctor, classes);
		return classes;
	}

	private getPolymorphicIds(component: AbstractConstructor) {
		const ids = new Array<string>();

		for (const parentClass of this.getOrderedParents(component)) {
			const parentId = Reflect.getOwnMetadata<string>(parentClass, "identifier");
			if (parentId === undefined) continue;

			ids.push(parentId);
		}

		const implementedList = Reflect.getMetadatas<string[]>(component, "flamework:implements");
		for (const implemented of implementedList) {
			for (const id of implemented) {
				ids.push(id);
			}
		}

		return ids;
	}

	/**
	 * @metadata macro
	 * @server
	 * */
	public AddSharedComponent<T extends SharedComponent>(
		player: Player | Player[] | "All",
		instance: Instance,
		componentSpecifier?: ConstructorRef<T>,
	) {
		assert(IsServer, "AddSharedComponent can't be called on server");
		assert(componentSpecifier, "Missing component specifier");

		const players = player === "All" ? Players.GetPlayers() : typeIs(player, "Instance") ? [player] : player;
		const component = this.components.addComponent(instance, componentSpecifier);
		const sharedInfo = component.GenerateInfo();

		players.forEach((player) => remotes._shared_component_component_interaction.fire(player, sharedInfo, "Add"));

		return component;
	}

	/** @server */
	public InvokeClientAddComponent(player: Player | Player[] | "All", component: SharedComponent) {
		assert(IsServer, "InvokeClientAddComponent can't be called on server");

		const players = player === "All" ? Players.GetPlayers() : typeIs(player, "Instance") ? [player] : player;
		const sharedInfo = component.GenerateInfo();

		players.forEach((player) => remotes._shared_component_component_interaction.fire(player, sharedInfo, "Add"));
	}

	/** @server */
	public InvokeClientRemoveComponent(player: Player | Player[] | "All", component: SharedComponent) {
		assert(IsServer, "InvokeClientAddComponent can't be called on server");

		const players = player === "All" ? Players.GetPlayers() : typeIs(player, "Instance") ? [player] : player;
		const sharedInfo = component.GenerateInfo();

		players.forEach((player) => remotes._shared_component_component_interaction.fire(player, sharedInfo, "Remove"));
	}

	/**
	 * @metadata macro
	 * @server
	 * */
	public RemoveSharedComponent<T extends SharedComponent>(
		player: Player | Player[] | "All",
		instance: Instance,
		removeFromServer: boolean = true,
		componentSpecifier?: ConstructorRef<T>,
	) {
		assert(IsServer, "AddSharedComponent can't be called on server");
		assert(componentSpecifier, "Missing component specifier");

		const players = player === "All" ? Players.GetPlayers() : typeIs(player, "Instance") ? [player] : player;
		const component = this.components.getComponent(instance, componentSpecifier);
		if (!component) return;

		const sharedInfo = component.GenerateInfo();
		removeFromServer && this.components.removeComponent(instance, componentSpecifier);

		players.forEach((player) => remotes._shared_component_component_interaction.fire(player, sharedInfo, "Remove"));
	}

	private invokeDispatch(component: SharedComponent, actions: SyncPayload<{}>) {
		component.__DispatchFromServer(actions);
	}

	private getComponentFromPointer(PointerID: string) {
		const pointer = Pointer.GetPointer(PointerID);

		if (!pointer) {
			logWarning(`Attempt to dispatch component with missing pointer\n PointerID: ${PointerID}`);
			return;
		}

		try {
			return pointer.GetComponentMetadata();
		} catch (error) {
			logWarning(`${error}\n PointerID: ${PointerID}`);
		}
	}

	private async resolveComponent({ ServerId, Identifier, SharedIdentifier, PointerID }: SharedComponentInfo) {
		if (!Modding.getObjectFromId(SharedIdentifier)) {
			logWarning(
				`Attempt to allow dispatching, but shared component does not exist\n SharedIdentifier: ${SharedIdentifier}`,
			);
			return;
		}

		const [success, instance] = WaitForClientSharedComponent(ServerId).timeout(15).await();
		if (!success) {
			logWarning(`Attempt to dispatch component with missing serverID\n ServerId: ${ServerId}`);
			return;
		}

		// Try get component from pointer
		if (PointerID) {
			const pointer = Pointer.GetPointer(PointerID);

			if (!pointer) {
				logWarning(`Attempt to dispatch component with missing pointer\n PointerID: ${PointerID}`);
				return;
			}

			try {
				const component = this.components.getComponent<SharedComponent>(
					instance,
					pointer.GetComponentMetadata(),
				);
				if (component) return component;
			} catch (error) {
				logWarning(`${error}\n PointerID: ${PointerID}`);
			}

			return;
		}

		// Try get component from indentifier
		if (Modding.getObjectFromId(Identifier)) {
			const component = this.components.getComponent<SharedComponent>(instance, Identifier);
			if (component) return component;
		}

		// Try get component from shared identifier
		const sharedComponent = this.components.getComponents<SharedComponent>(instance, SharedIdentifier);

		if (sharedComponent.size() > 1) {
			logWarning(
				`Attempt to allow dispatching when an instance has multiple sharedComponent\n 
				Instance: ${instance}\n 
				SharedIdentifier: ${SharedIdentifier}\n 
				ServerIdentifier: ${Identifier}\n 
				FoundComponents: ${sharedComponent.map((s) => GetConstructorIdentifier(getmetatable(s) as never)).join(", ")}`,
			);
			return;
		}

		return sharedComponent[0];
	}

	private onClientSetup() {
		remotes._shared_component_dispatch.connect(async (actions, componentInfo) => {
			const component = await this.resolveComponent(componentInfo);
			if (component !== undefined) this.invokeDispatch(component, actions);
		});

		remotes._shared_component_remote_event_Client.connect(async (componentInfo, eventName, args) => {
			const component = await this.resolveComponent(componentInfo);
			if (!component) return;

			const remote = component.GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventServerToClient.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(...(args as []));
		});

		remotes._shared_component_component_interaction.connect(async (info, action) => {
			const componetID = info.PointerID
				? this.getComponentFromPointer(info.PointerID)
				: info.SharedIdentifier === info.Identifier
					? info.SharedIdentifier
					: this.getSharedComponentChild(info.SharedIdentifier);
			if (!componetID) return;

			const [success, instance] = WaitForClientSharedComponent(info.ServerId).timeout(15).await();
			if (!success) {
				logWarning("Attempt to dispatch component with missing serverID\n ServerId: " + info.ServerId);
				return;
			}

			action === "Add"
				? this.components.addComponent(instance, componetID)
				: this.components.removeComponent(instance, componetID);
		});

		remotes._shared_component_disconnected.connect(async (componentInfo) => {
			const component = await this.resolveComponent(componentInfo);
			if (!component) return;

			component.__Disconnected();
		});
	}

	private onServerSetup() {
		remotes._shared_component_remote_event_Server.connect(async (player, componentInfo, eventName, args) => {
			const component = await this.resolveComponent(componentInfo);
			if (!component) return;
			if (!component.IsConnectedPlayer(player)) return;

			const remote = component.GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventClientToServer.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(player, ...(args as []));
		});

		remotes._shared_component_remote_function_Server.onRequest(async (player, componentInfo, remoteName, args) => {
			const component = await this.resolveComponent(componentInfo);
			if (!component) return;
			if (!component.IsConnectedPlayer(player)) return PLAYER_NOT_CONNECTED;

			const remote = component.GetRemote(remoteName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteAction.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return ACTION_GUARD_FAILED;

			return remote.GetCallback()?.(player, ...(args as []));
		});

		remotes._shared_component_connection.onRequest(async (player, componentInfo, action) => {
			const component = await this.resolveComponent(componentInfo);
			if (!component) return false;

			if (action === PlayerAction.Connect) {
				if (component.IsConnectedPlayer(player)) return false;
				return component.__OnPlayerConnect(player);
			}

			if (action === PlayerAction.Disconnect) {
				if (!component.IsConnectedPlayer(player)) return false;
				component.__OnPlayerDisconnect(player);
				return true;
			}

			return false;
		});
	}
}
