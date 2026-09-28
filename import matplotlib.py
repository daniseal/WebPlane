import matplotlib.pyplot as plt
import numpy as np

# Parámetros de la elipse
h, k = -2, 1    # centro
a, b = 3, 2     # semiejes (a vertical, b horizontal)

# Ecuación paramétrica
t = np.linspace(0, 2*np.pi, 400)
x = h + b * np.cos(t)
y = k + a * np.sin(t)

# Focos
c = np.sqrt(a**2 - b**2)
focos = [(-2, 1 + c), (-2, 1 - c)]

# Vértices y co-vértices
vertices = [(-2, 1 + a), (-2, 1 - a)]
co_vertices = [(-2 + b, 1), (-2 - b, 1)]

# Dibujo
plt.figure(figsize=(7,7))
plt.plot(x, y, 'b', label='Elipse')
plt.scatter(h, k, color='red', label='Centro C(-2,1)')
plt.scatter(*zip(*vertices), color='green', label='Vértices')
plt.scatter(*zip(*co_vertices), color='orange', label='Co-vértices')
plt.scatter(*zip(*focos), color='purple', label='Focos')

# Etiquetas de puntos
plt.text(h+0.2, k+0.2, 'C(-2,1)', color='red')
plt.text(-2.3, 4.1, 'V1(-2,4)', color='green')
plt.text(-2.3, -2.3, 'V2(-2,-2)', color='green')
plt.text(0.1, 1.1, 'Cv1(0,1)', color='orange')
plt.text(-4.8, 1.1, 'Cv2(-4,1)', color='orange')
plt.text(-2.5, 3.3, 'F1(-2,3.24)', color='purple')
plt.text(-2.5, -1.3, 'F2(-2,-1.24)', color='purple')

# Ejes y cuadrícula
plt.axhline(0, color='black', linewidth=1)
plt.axvline(0, color='black', linewidth=1)
plt.grid(True, linestyle='--', alpha=0.6)
plt.axis('equal')
plt.xlabel('Eje X')
plt.ylabel('Eje Y')
plt.title('Elipse trasladada: ((X+2)²/4) + ((Y-1)²/9) = 1')
plt.legend()
plt.savefig('elipse_trasladada.png', dpi=300)
plt.show()

