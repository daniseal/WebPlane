import * as THREE from 'three';
import { TANK_BUILDERS } from './simulator-tanks.js';
import { AIRCRAFT_BUILDERS } from './simulator-aircraft.js';

export const VEHICLES = [
    {
        id: 'mark-i', name: 'Mark I', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Reino Unido', type: 'tank',
        description: 'Tanque británico de orugas romboidales, empleado por primera vez en combate en 1916.',
        photo: 'img/historicos/british-heavy-tanks-of-the-first-world-war.jpg',
        dimensions: { length: 9.9, width: 4.2, height: 2.5 }
    },
    {
        id: 'sopwith-camel', name: 'Sopwith Camel', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Reino Unido', type: 'aircraft',
        description: 'Caza biplano británico conocido por su maniobrabilidad y su exigente pilotaje.',
        photo: 'img/historicos/sopwith-camel.jpg',
        dimensions: { length: 5.7, width: 8.5, height: 2.6 }
    },
    {
        id: 'tiger-i', name: 'Tiger I', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Alemania', type: 'tank',
        description: 'Tanque pesado alemán destacado por su blindaje y su cañón de 88 mm.',
        photo: 'img/historicos/tiger-i.jpg',
        dimensions: { length: 8.5, width: 3.7, height: 3.0 }
    },
    {
        id: 'spitfire', name: 'Supermarine Spitfire', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Reino Unido', type: 'aircraft',
        description: 'Caza británico de ala elíptica, clave en la defensa aérea del Reino Unido.',
        photo: 'img/historicos/supermarine-spitfire.jpg',
        dimensions: { length: 9.1, width: 11.2, height: 3.5 }
    },
    {
        id: 'm1-abrams', name: 'M1 Abrams', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Estados Unidos', type: 'tank',
        description: 'Tanque de combate estadounidense con torreta de perfil angular y motor de turbina.',
        photo: 'img/m1.jpg',
        dimensions: { length: 9.8, width: 3.7, height: 2.4 }
    },
    {
        id: 'f-35', name: 'F-35 Lightning II', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Estados Unidos', type: 'aircraft',
        description: 'Caza polivalente de quinta generación, diseñado con baja observabilidad y sensores integrados.',
        photo: 'img/F35.jpg',
        dimensions: { length: 15.7, width: 10.7, height: 4.4 }
    },
    {
        id: 'renault-ft', name: 'Renault FT', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Francia', type: 'tank',
        description: 'Tanque ligero francés con torreta giratoria y una distribución que influyó en los carros de combate posteriores.',
        photo: 'img/historicos/renault-ft.jpg'
    },
    {
        id: 'fokker-dr1', name: 'Fokker Dr.I', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Alemania', type: 'aircraft',
        description: 'Caza triplano alemán de gran maniobrabilidad, asociado a Manfred von Richthofen.',
        photo: 'img/historicos/fokker-dr-i.jpg'
    },
    {
        id: 'm4-sherman', name: 'M4 Sherman', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Estados Unidos', type: 'tank',
        description: 'Tanque medio estadounidense producido en grandes cantidades y empleado por numerosos ejércitos aliados.',
        photo: 'img/historicos/m4-sherman.jpg'
    },
    {
        id: 'bf-109', name: 'Messerschmitt Bf 109', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Alemania', type: 'aircraft',
        description: 'Caza monomotor alemán de tren retráctil y uno de los principales aviones de combate de la Luftwaffe.',
        photo: 'img/historicos/messerschmitt-bf-109.jpg'
    },
    {
        id: 't-90', name: 'T-90', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Rusia', type: 'tank',
        description: 'Tanque de combate ruso de perfil bajo, con torreta central y módulos de protección sobre el blindaje.',
        photo: 'img/t-90.jpg'
    },
    {
        id: 'su-57', name: 'Sukhoi Su-57', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Rusia', type: 'aircraft',
        description: 'Caza ruso bimotor de quinta generación, concebido para superioridad aérea y ataque a objetivos de superficie.',
        photo: 'img/SU-57.png'
    }
];

export function createVehicle(id) {
    const factory = TANK_BUILDERS[id] || AIRCRAFT_BUILDERS[id];
    if (!factory) throw new Error('Modelo desconocido: ' + id);
    const group = factory();
    group.name = id;
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty() || !Number.isFinite(bounds.min.y)) throw new Error('Geometría inválida: ' + id);
    group.position.y -= bounds.min.y;
    return group;
}
