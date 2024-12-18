/*document.addEventListener("DOMContentLoaded", function() {
    var carrusel = document.querySelector(".carrusel");
    var imagenes = document.querySelectorAll(".imagen");
    var posicionActual = 0;

    function moverDerecha() {
        carrusel.style.transition = "2s";
        carrusel.style.transform = `translateX(-${posicionActual * 100}%)`;
        posicionActual++;
        if (posicionActual >= imagenes.length) {
            posicionActual = 0;
        }
    }

    function moverIzquierda() {
        carrusel.style.transition = "2s";
        carrusel.style.transform = `translateX(-${posicionActual * 100}%)`;
        posicionActual--;
        if (posicionActual < 0) {
            posicionActual = imagenes.length - 1;
        }
    }

    document.getElementById("botonDerecha").addEventListener("click", moverDerecha);
    document.getElementById("botonIzquierda").addEventListener("click", moverIzquierda);
});