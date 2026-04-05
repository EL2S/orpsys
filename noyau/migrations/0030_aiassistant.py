from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0029_pos_shift_entry_timestamps"),
    ]

    operations = [
        migrations.CreateModel(
            name="AiAssistant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ],
            options={
                "verbose_name": "AI Assistant",
                "verbose_name_plural": "AI Assistant",
            },
        ),
    ]
