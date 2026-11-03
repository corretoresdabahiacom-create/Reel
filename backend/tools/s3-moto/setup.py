"""Prepara um moto (emulador AWS) com AUTENTICAÇÃO IAM ligada — a assinatura SigV4 de cada chamada é conferida —
no formato da produção: buckets com criptografia padrão SSE-KMS (como infra/terraform/modules/storage) e um usuário
só com acesso a S3/KMS. Imprime um JSON com credenciais, buckets e a chave KMS para o tests/41."""
import boto3, json, sys
ep, prefix = sys.argv[1], sys.argv[2]
boot = dict(endpoint_url=ep, region_name='us-east-1', aws_access_key_id='boot', aws_secret_access_key='boot')
iam = boto3.client('iam', **boot)
iam.create_user(UserName='nexus-app')
iam.put_user_policy(UserName='nexus-app', PolicyName='app', PolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': ['s3:*', 'kms:*'], 'Resource': '*'}]}))
k = iam.create_access_key(UserName='nexus-app')['AccessKey']
cred = dict(endpoint_url=ep, region_name='us-east-1', aws_access_key_id=k['AccessKeyId'], aws_secret_access_key=k['SecretAccessKey'])
key = boto3.client('kms', **cred).create_key(Description='nexus teste')['KeyMetadata']['Arn']
s3 = boto3.client('s3', **cred); buckets = {}
for b in ['uploads', 'videos', 'exports', 'archive']:
    name = f'{prefix}-{b}'; s3.create_bucket(Bucket=name); buckets[b] = name
    s3.put_bucket_encryption(Bucket=name, ServerSideEncryptionConfiguration={'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'aws:kms', 'KMSMasterKeyID': key}}]})
print(json.dumps({'endpoint': ep, 'id': k['AccessKeyId'], 'secret': k['SecretAccessKey'], 'kms': key, 'buckets': buckets}))
