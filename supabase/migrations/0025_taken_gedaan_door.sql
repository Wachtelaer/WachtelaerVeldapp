-- Wachtelaer Veldapp — bij een gedeelde werf-taak is het nuttig om te
-- weten wie ze effectief heeft afgevinkt (bij een taak voor één
-- medewerker is dat vanzelfsprekend, maar niet meer bij "Hele werf").

alter table taken add column gedaan_door uuid references profiles(id);
