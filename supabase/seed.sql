-- Content for El Gran Scavenger Hunt de Bogotá (2026-10-03). Re-runnable: upserts stops/sides, inserts teams once.
-- The admin passcode hash is set separately (never committed):
--   insert into hunt.config(id, admin_hash) values (1, '<sha256 hex of passcode>') on conflict (id) do update set admin_hash = excluded.admin_hash;

insert into hunt.stops (n, name, clue, ask, proof, hint, qm, finish, lat, lng, radius, answer_words) values
(1, 'Plaza de Bolívar', $q$En la plaza más importante,
levanten los ojos
para copiar una frase.$q$, 'Escriban la frase del Palacio de Justicia', 'phrase',
 'El Palacio de Justicia, en el costado norte de la plaza. La frase está grabada en la fachada.', null, false, 4.59819, -74.076053, 250, '{armas,leyes,libertad}'),
(2, 'Museo Botero', $q$Un ladrón en el gobierno,
un ladrón en el banco,
un ladrón en el techo,
¡qué escándalo!

Los dos primeros se encuentran todos los días,
el último, pintado por un famoso,
¿dónde lo verías?$q$, 'Selfie del equipo con el Ladrón', 'photo',
 'Calle 11 con Carrera 4, La Candelaria. La entrada es gratis.', null, false, 4.596698, -74.07335, 250, null),
(3, 'Policarpa, Las Aguas', $q$La pola toma su nombre
de una chica y no de un hombre.
Al lado de los Andes y Las Aguas,
rendimos homenaje a Policarpa.$q$, 'Nota de voz leyendo la inscripción de la cara norte', 'voice',
 'Avenida Jiménez con Carrera 3, frente a la Universidad de los Andes.', null, false, 4.6027, -74.0685, 400, null),
(4, 'Quinta de Bolívar', $q$Nacido en Venezuela, muerto en Colombia,
entre esas dos cosas, liberó cuatro otras.
Pero no busca cuatro, sino un número más:
una casa y un jardín,
¿a dónde te vas?$q$, 'Selfie en la casa + trivia con un quizmaster', 'photo',
 'La casa de campo de Bolívar, al pie de Monserrate.', 'Busquen a Ross en la entrada. Trivia: universidades y localidades.', false, 4.6004, -74.0641, 400, null),
(5, 'Plaza La Perseverancia', $q$Presidentes, un autor y una pintora.
En el billete de $2.000 aparece ______.
En el mismo billete, al otro lado, un vecindario con una plaza
donde venden ajiaco.

Compren uno, cómanlo
y mándennos una selfie con el plato vacío.$q$, 'Selfie con el plato de ajiaco vacío', 'photo',
 'La pintora es Débora Arango. El mercado que buscan está en el barrio La Perseverancia.', null, false, 4.616465, -74.066279, 250, null),
(6, 'Matorral / Diosa, Teusaquillo', $q$En La Macarena el arquitecto puso tres torres,
donde sus residentes han vivido mil historias.
Al frente, una librería verde contiene mil más,
pero esta librería tiene otra sede.

Encuéntrenla para que procedan.$q$, 'Selfie del equipo en la librería', 'photo',
 'La librería verde frente a las Torres del Parque se llama Matorral. Su otra sede está en Teusaquillo, con Diosa Cervecería.', null, false, 4.625927, -74.073444, 250, null),
(7, 'Casa de Betty la Fea', $q$Cambiamos de libros a la televisión.
Un personaje famoso en ese vecindario tenía su habitación.
Vayan a visitarla, la de gafas y brackets,
y tomen una foto donde ella existía.$q$, 'Foto recreando una pose de Betty', 'photo',
 'Carrera 18A # 43A-59, Teusaquillo.', null, false, 4.6330, -74.0725, 400, null),
(8, 'Biblioteca Virgilio Barco', $q$Salmona no solo diseñó apartamentos,
también diseñó un espacio para prestar libros,
en un edificio redondo de ladrillo y con fuente,
nombrado por un presidente
que buscó paz y constituyente.$q$, 'Foto del carné BibloRed + trivia con Julia', 'photo',
 'Dentro del parque Simón Bolívar, Avenida Carrera 60 # 57-60.', 'Julia los espera adentro. Trivia: cuerpos de agua y figuras culturales.', false, 4.6578, -74.0906, 400, null),
(9, 'Theatron', $q$En Bogotá hay catedrales, iglesias y capillas;
la gran mayoría solo abren de día.
Pero hay un lugar de alabanza que se llena de noche,
un templo en Chapinero donde los gays se gozan.$q$, 'Selfie “ilustrativa” afuera (10 pts extra a la más evocativa)', 'photo',
 'La discoteca más famosa de Chapinero, sobre la Calle 58.', null, false, 4.644929, -74.063764, 250, null),
(10, 'FRANC', $q$La última parada es la de siempre,
donde solemos llegar a tomar un vino.$q$, 'Selfie en la puerta. Esta foto detiene su reloj.', 'photo',
 'Carrera 4 Bis # 58-40, Chapinero.', null, true, 4.643281, -74.060122, 250, null)
on conflict (n) do update set name = excluded.name, clue = excluded.clue, ask = excluded.ask, proof = excluded.proof, hint = excluded.hint,
  qm = excluded.qm, finish = excluded.finish, lat = excluded.lat, lng = excluded.lng, radius = excluded.radius, answer_words = excluded.answer_words;

insert into hunt.sides (id, name, place, pts, after_stop, ask, sort) values
('coin', 'La moneda más antigua', 'Casa de Moneda, junto al Botero', 20, 2, 'Foto de la moneda colombiana más antigua en exhibición', 1),
('terminal', 'Tiquete a la batalla', 'Terminal Salitre', 50, 6, '7 de agosto de 1819. Compren el tiquete y muéstrenlo en FRANC', 2),
('novios', 'Foto de prom', 'Parque de Los Novios', 20, 8, 'Foto en el puente del lago, como si fueran al prom', 3)
on conflict (id) do update set name = excluded.name, place = excluded.place, pts = excluded.pts, after_stop = excluded.after_stop, ask = excluded.ask, sort = excluded.sort;

-- Event teams: departure order is re-randomised on the day from the admin page.
insert into hunt.teams (id, name, color, token, depart, is_test)
select v.id, v.name, v.color, translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
       timestamptz '2026-10-03 10:00:00-05' + (v.ord * interval '10 minutes'), false
from (values ('t1','Equipo 1','#CF5436',0), ('t2','Equipo 2','#2E7A57',1), ('t3','Equipo 3','#7A4B2A',2),
             ('t4','Equipo 4','#E4AA2A',3), ('t5','Equipo 5','#3F6FD8',4)) as v(id, name, color, ord)
on conflict (id) do nothing;

-- Test teams: already "departed" so the flow can be tried any time; reset from the admin page.
insert into hunt.teams (id, name, color, token, depart, is_test)
select v.id, v.name, v.color, translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'), now() - interval '1 minute', true
from (values ('prueba-ross','Prueba Ross','#16347F'), ('prueba-julia','Prueba Julia','#8A3FA0')) as v(id, name, color)
on conflict (id) do nothing;
