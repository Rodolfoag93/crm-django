from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib import messages
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required

@login_required
def home(request):
    return render(request, 'core/home.html')

def register(request):
    if request.method == "POST":
        form = UserCreationForm(request.POST)

        if form.is_valid():
            username = form.cleaned_data.get("username")

            # Validación extra opcional (seguridad)
            if User.objects.filter(username=username).exists():
                messages.error(request, "Ese nombre de usuario ya está registrado.")
                return render(request, "auth/register.html", {"form": form})

            form.save()
            messages.success(request, "Usuario creado correctamente. Ahora inicia sesión.")
            return redirect("login")

        else:
            messages.error(request, "Corrige los errores del formulario.")

    else:
        form = UserCreationForm()

    return render(request, "auth/register.html", {"form": form})